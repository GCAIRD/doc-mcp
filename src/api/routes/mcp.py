"""MCP routes - unified endpoint, URL path distinguishes project"""

import asyncio
import json
import logging
import time
import uuid

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.responses import Response

logger = logging.getLogger(__name__)
router = APIRouter()


def get_tools(project: str | None = None, project_config=None) -> dict:
	"""Dynamically generate tool definitions based on project"""
	if project:
		# Single project mode: no project param needed
		if project_config:
			proj_desc = project_config.get_description(project) or project
			has_resources = bool(project_config.get_resources(project))
		else:
			proj_desc = project
			has_resources = False

		# Base description
		search_desc = f"Search {proj_desc} documentation. Returns relevant code examples, API docs and feature descriptions.\n\n[IMPORTANT] Before calling any API or implementing features, always search to confirm: 1) Method signatures and parameters 2) Return types 3) Usage examples. Do not rely on memorized API knowledge as documentation may have been updated."
		if has_resources:
			search_desc += "\n\n[REQUIRED] Before generating code with script references or imports, you MUST call get_code_guidelines to obtain correct reference paths."

		tools = {
			"search": {
				"description": search_desc,
				"inputSchema": {
					"type": "object",
					"properties": {
						"query": {
							"type": "string",
							"description": "Search query",
						},
						"limit": {
							"type": "integer",
							"description": "Number of results to return",
							"default": 5,
						},
					},
					"required": ["query"],
				},
			},
			"fetch": {
				"description": f"Fetch full document content by doc_id for {proj_desc}. Search results are summaries only - always fetch full context before implementing code.",
				"inputSchema": {
					"type": "object",
					"properties": {
						"doc_id": {
							"type": "string",
							"description": "Document ID from search results",
						}
					},
					"required": ["doc_id"],
				},
			},
		}

		# Only expose get_code_guidelines for projects with resources configured
		if has_resources:
			tools["get_code_guidelines"] = {
				"description": f"Get code generation guidelines for {proj_desc}, including CDN links and package references. [REQUIRED] You MUST call this tool before generating any code with script tags or import statements. Failure to do so will result in incorrect reference links.",
				"inputSchema": {
					"type": "object",
					"properties": {
						"guideline_type": {
							"type": "string",
							"enum": ["cdn_scripts", "npm_packages", "all"],
							"description": "Guideline type: cdn_scripts=CDN script references, npm_packages=NPM package references, all=everything",
							"default": "all",
						}
					},
					"required": [],
				},
			}

		return tools
	else:
		# Multi-project mode
		project_names = project_config.project_names if project_config else ["spreadjs", "gcexcel"]

		# Find projects with resources configured
		projects_with_resources = []
		if project_config:
			for pn in project_names:
				if project_config.get_resources(pn):
					projects_with_resources.append(pn)

		# Base description
		search_desc = "Search MESCIUS product documentation. Returns relevant code examples, API docs and feature descriptions.\n\n[IMPORTANT] Before calling any API or implementing features, always search to confirm: 1) Method signatures and parameters 2) Return types 3) Usage examples. Do not rely on memorized API knowledge as documentation may have been updated."
		if projects_with_resources:
			search_desc += f"\n\n[REQUIRED] Before generating code with script references or imports for {'/'.join(projects_with_resources)}, you MUST call get_code_guidelines to obtain correct reference paths."

		tools = {
			"search": {
				"description": search_desc,
				"inputSchema": {
					"type": "object",
					"properties": {
						"query": {
							"type": "string",
							"description": "Search query",
						},
						"project": {
							"type": "string",
							"description": f"Project: {' or '.join(project_names)}",
							"enum": project_names,
						},
						"limit": {
							"type": "integer",
							"description": "Number of results to return",
							"default": 5,
						},
					},
					"required": ["query", "project"],
				},
			},
			"fetch": {
				"description": "Fetch full document content by doc_id. Search results are summaries only - always fetch full context before implementing code.",
				"inputSchema": {
					"type": "object",
					"properties": {
						"doc_id": {"type": "string", "description": "Document ID"},
						"project": {
							"type": "string",
							"description": f"Project: {' or '.join(project_names)}",
							"enum": project_names,
						},
					},
					"required": ["doc_id", "project"],
				},
			},
		}

		# Only expose get_code_guidelines if any project has resources configured
		if projects_with_resources:
			tools["get_code_guidelines"] = {
				"description": f"Get code generation guidelines including CDN links and package references. [REQUIRED] You MUST call this tool before generating any code with script tags or import statements. Failure to do so will result in incorrect reference links. Only {'/'.join(projects_with_resources)} support this tool.",
				"inputSchema": {
					"type": "object",
					"properties": {
						"project": {
							"type": "string",
							"description": f"Project: {' or '.join(projects_with_resources)}",
							"enum": projects_with_resources,
						},
						"guideline_type": {
							"type": "string",
							"enum": ["cdn_scripts", "npm_packages", "all"],
							"description": "Guideline type: cdn_scripts=CDN script references, npm_packages=NPM package references, all=everything",
							"default": "all",
						}
					},
					"required": ["project"],
				},
			}

		return tools


def create_response(message_id: str | int | None, result: dict) -> dict:
	return {"jsonrpc": "2.0", "id": message_id, "result": result}


def create_error(message_id: str | int | None, code: int, message: str) -> dict:
	return {
		"jsonrpc": "2.0",
		"id": message_id,
		"error": {"code": code, "message": message},
	}


def create_tool_result(data, *, is_error: bool = False) -> dict:
	"""Build tools/call result - JSON-serialize dicts, use str directly otherwise"""
	text = json.dumps(data, ensure_ascii=False) if isinstance(data, dict) else str(data)
	result = {"content": [{"type": "text", "text": text}], "isError": is_error}
	return result


async def handle_search(args: dict, project: str) -> dict:
	"""Execute RAG search via searcher directly"""
	from ..app import get_searchers

	searchers = get_searchers()
	if project not in searchers:
		raise ValueError(f"Project '{project}' not available. Available: {list(searchers.keys())}")

	searcher = searchers[project]
	result = await asyncio.to_thread(
		searcher.search,
		query=args["query"],
		limit=args.get("limit", 5),
		use_rerank=True,
	)

	# Convert SearchResult dataclasses to dicts
	results = [
		{
			"rank": r.rank,
			"doc_id": r.doc_id,
			"chunk_id": r.chunk_id,
			"score": r.score,
			"content": r.content,
			"content_preview": r.content_preview,
			"metadata": r.metadata,
		}
		for r in result["results"]
	]

	response = {
		"results": results,
		"search_time_ms": result["search_time_ms"],
	}
	response["_guidance"] = "Determine if further queries are needed: If your next code will call APIs mentioned in results and you're not 100% certain of parameter order, types, or return values, you should fetch full docs or search again for that specific API."
	return response


async def handle_fetch(args: dict, project: str) -> dict:
	"""Fetch full document via searcher directly"""
	from ..app import get_searchers

	searchers = get_searchers()
	if project not in searchers:
		raise ValueError(f"Project '{project}' not available. Available: {list(searchers.keys())}")

	searcher = searchers[project]
	doc_id = args["doc_id"]
	chunks = await asyncio.to_thread(searcher.get_doc_chunks, doc_id)

	if not chunks:
		return {"error": f"Document {doc_id} not found"}

	full_content = "\n\n".join([c["content"] for c in chunks])
	result = {
		"doc_id": doc_id,
		"project": project,
		"chunk_count": len(chunks),
		"full_content": full_content,
		"metadata": chunks[0]["metadata"] if chunks else {},
	}
	result["_guidance"] = "Full document retrieved. If unfamiliar class or method names appear, search for their usage before calling them."
	return result


async def handle_get_code_guidelines(args: dict, project: str, project_config) -> dict:
	"""Get code generation guidelines"""
	guideline_type = args.get("guideline_type", "all")
	resources = project_config.get_resources(project) if project_config else {}

	if not resources:
		return {"guidelines": {}, "_note": f"Project {project} has no code guidelines configured"}

	if guideline_type == "all":
		result = {}
		for res_id, res_info in resources.items():
			result[res_id] = {
				"name": res_info.get("name", res_id),
				"description": res_info.get("description", ""),
				"content": res_info.get("content", ""),
			}
		return {"guidelines": result}
	elif guideline_type in resources:
		res_info = resources[guideline_type]
		return {
			"guidelines": {
				guideline_type: {
					"name": res_info.get("name", guideline_type),
					"description": res_info.get("description", ""),
					"content": res_info.get("content", ""),
				}
			}
		}
	else:
		return {"guidelines": {}, "_note": f"Type {guideline_type} not found. Available: {list(resources.keys())}"}


async def route_message(
	message: dict, project: str | None,
) -> dict | None:
	"""Route MCP message"""
	method = message.get("method")
	message_id = message.get("id")
	params = message.get("params", {})

	if method == "initialize":
		return create_response(
			message_id,
			{
				"protocolVersion": "2025-03-26",
				"capabilities": {"tools": {}},
				"serverInfo": {"name": "MCS-DOC-MCP-Server", "version": "1.0.0"},
			},
		)

	elif method == "notifications/initialized":
		return None

	elif method and method.startswith("notifications/"):
		# Silently handle all notifications (cancelled, etc.)
		return None

	elif method == "ping":
		return create_response(message_id, {})

	elif method == "tools/list":
		from ..app import get_project_config
		tools_list = [
			{"name": name, **defn} for name, defn in get_tools(project, get_project_config()).items()
		]
		return create_response(message_id, {"tools": tools_list})

	elif method == "tools/call":
		tool_name = params.get("name")
		arguments = params.get("arguments", {})

		# If URL specifies project, use URL's project
		actual_project = project or arguments.get("project")
		if not actual_project:
			return create_error(message_id, -32002, "project is required")

		# get_code_guidelines special handling (doesn't need RAG service)
		if tool_name == "get_code_guidelines":
			try:
				from ..app import get_project_config
				result = await handle_get_code_guidelines(arguments, actual_project, get_project_config())
				return create_response(message_id, create_tool_result(result))
			except Exception as e:
				return create_response(message_id, create_tool_result(str(e), is_error=True))

		handlers = {
			"search": handle_search,
			"fetch": handle_fetch,
		}

		if tool_name not in handlers:
			return create_error(message_id, -32602, f"Unknown tool: {tool_name}")

		try:
			result = await handlers[tool_name](arguments, actual_project)
			return create_response(message_id, create_tool_result(result))
		except Exception as e:
			return create_response(message_id, create_tool_result(str(e), is_error=True))

	return create_error(message_id, -32601, f"Unknown method: {method}")


@router.get("/mcp")
@router.get("/mcp/{project}")
async def mcp_get():
	"""MCP GET - return 405 per spec (no SSE stream)"""
	return Response(status_code=405)


@router.post("/mcp")
async def mcp_post(request: Request):
	"""MCP POST - generic endpoint (requires project in params)"""
	return await _handle_mcp_request(request, project=None)


@router.post("/mcp/{project}")
async def mcp_project(request: Request, project: str):
	"""MCP POST - project-specific endpoint"""
	return await _handle_mcp_request(request, project=project)


@router.delete("/mcp")
@router.delete("/mcp/{project}")
async def mcp_delete():
	"""MCP DELETE - client session termination (stateless, return 405)"""
	return Response(status_code=405)


async def _handle_mcp_request(request: Request, project: str | None):
	"""Handle MCP request"""
	from ..app import get_access_logger

	access_logger = get_access_logger()
	start_time = time.perf_counter()

	try:
		body = await request.json()
	except json.JSONDecodeError:
		return JSONResponse(content=create_error(None, -32700, "Parse error"), status_code=400)

	# Batch or single message
	is_batch = isinstance(body, list)
	messages = body if is_batch else [body]

	if not messages:
		return JSONResponse(content=create_error(None, -32600, "Invalid Request"), status_code=400)

	try:
		session_id = request.headers.get("Mcp-Session-Id")
		request_id = getattr(request.state, "request_id", str(uuid.uuid4())[:8])
		client_ip = request.client.host if request.client else "unknown"

		# Distinguish request (has id + method) from notification/response
		has_request = any(_is_jsonrpc_request(m) for m in messages)

		responses = []
		for message in messages:
			# Basic validation
			if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
				if _is_jsonrpc_request(message):
					responses.append(create_error(message.get("id"), -32600, "Invalid Request"))
				continue

			# JSON-RPC response from client -> ignore
			if "result" in message or "error" in message:
				continue

			# notification or request
			if "method" not in message:
				continue

			response_data = await route_message(message, project)

			# Log access
			if access_logger and message.get("method") == "tools/call":
				_log_tool_call(access_logger, request_id, client_ip, project, message, response_data, start_time)

			if response_data is not None:
				responses.append(response_data)

		# All notifications/responses -> 202 Accepted, no body
		if not has_request:
			return Response(status_code=202)

		# Build response
		if not responses:
			return Response(status_code=202)

		result = responses if is_batch else responses[0]
		response = JSONResponse(content=result)

		# Return session id on initialize
		if not is_batch and messages[0].get("method") == "initialize" and not session_id:
			response.headers["Mcp-Session-Id"] = str(uuid.uuid4())

		return response

	except Exception as e:
		logger.error(f"MCP Error: {e}")
		return JSONResponse(content=create_error(None, -32603, str(e)))


def _is_jsonrpc_request(message: dict) -> bool:
	"""Check if message is a JSON-RPC request (has id and method)"""
	return isinstance(message, dict) and "id" in message and "method" in message


def _log_tool_call(
	access_logger, request_id, client_ip, project, message, response_data, start_time
):
	"""Log tool call access"""
	params = message.get("params", {})
	tool_name = params.get("name")
	arguments = params.get("arguments", {})
	duration_ms = (time.perf_counter() - start_time) * 1000

	result_count = 0
	if response_data and "result" in response_data:
		content = response_data["result"].get("content", [])
		if content and len(content) > 0:
			try:
				text = content[0].get("text", "{}")
				parsed = json.loads(text)
				result_count = len(parsed.get("results", []))
			except (json.JSONDecodeError, KeyError, TypeError):
				pass

	access_logger.log_mcp_call(
		request_id=request_id,
		client_ip=client_ip,
		project=project or arguments.get("project", "unknown"),
		tool=tool_name,
		arguments=arguments,
		duration_ms=duration_ms,
		status_code=200,
		result_count=result_count,
	)


@router.get("/tools/list")
@router.post("/tools/list")
async def list_tools():
	"""List all tools"""
	from ..app import get_project_config
	tools_list = [{"name": name, **defn} for name, defn in get_tools(None, get_project_config()).items()]
	return JSONResponse(content={"jsonrpc": "2.0", "result": {"tools": tools_list}})


@router.get("/initialize")
@router.post("/initialize")
async def initialize():
	"""MCP initialization"""
	return JSONResponse(
		content={
			"jsonrpc": "2.0",
			"result": {
				"protocolVersion": "2025-03-26",
				"capabilities": {"tools": {}},
				"serverInfo": {"name": "MCS-DOC-MCP-Server", "version": "1.0.0"},
			},
		}
	)
