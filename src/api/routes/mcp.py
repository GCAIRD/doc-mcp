"""MCP routes - unified endpoint, URL path distinguishes project"""

import json
import logging
import time
import uuid

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

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


async def handle_search(args: dict, project: str, rag_service_url: str) -> dict:
	"""Execute RAG search"""
	from ..app import get_http_client
	client = get_http_client()
	resp = await client.post(
		f"{rag_service_url}/search",
		json={
			"query": args["query"],
			"project": project,
			"limit": args.get("limit", 5),
			"use_rerank": True,
		},
	)
	resp.raise_for_status()
	result = resp.json()
	# Guide agent to determine if further queries are needed
	result["_guidance"] = "Determine if further queries are needed: If your next code will call APIs mentioned in results and you're not 100% certain of parameter order, types, or return values, you should fetch full docs or search again for that specific API."
	return result


async def handle_fetch(args: dict, project: str, rag_service_url: str) -> dict:
	"""Fetch full document"""
	from ..app import get_http_client
	client = get_http_client()
	resp = await client.get(
		f"{rag_service_url}/doc/{args['doc_id']}",
		params={"project": project},
	)
	resp.raise_for_status()
	result = resp.json()
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
	message: dict, project: str | None, rag_service_url: str
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
				return create_response(
					message_id,
					{"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]},
				)
			except Exception as e:
				return create_error(message_id, -32004, f"Tool error: {str(e)}")

		handlers = {
			"search": handle_search,
			"fetch": handle_fetch,
		}

		if tool_name not in handlers:
			return create_error(message_id, -32002, f"Unknown tool: {tool_name}")

		try:
			result = await handlers[tool_name](arguments, actual_project, rag_service_url)
			return create_response(
				message_id,
				{"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]},
			)
		except httpx.HTTPStatusError as e:
			return create_error(
				message_id, -32004, f"RAG Service error: {e.response.status_code}"
			)
		except Exception as e:
			return create_error(message_id, -32004, f"Tool error: {str(e)}")

	return create_error(message_id, -32601, f"Unknown method: {method}")


@router.get("/mcp")
async def mcp_get():
	"""MCP GET - SSE stream placeholder"""
	return JSONResponse(
		content={"info": "SSE stream not implemented, use POST for requests"}
	)


@router.post("/mcp")
async def mcp_post(request: Request):
	"""MCP POST - generic endpoint (requires project in params)"""
	return await _handle_mcp_request(request, project=None)


@router.post("/mcp/{project}")
async def mcp_project(request: Request, project: str):
	"""MCP POST - project-specific endpoint"""
	return await _handle_mcp_request(request, project=project)


async def _handle_mcp_request(request: Request, project: str | None):
	"""Handle MCP request"""
	from ..app import get_access_logger, get_settings

	settings = get_settings()
	access_logger = get_access_logger()
	start_time = time.perf_counter()

	try:
		message = await request.json()
		if message.get("jsonrpc") != "2.0" or "method" not in message:
			return JSONResponse(content=create_error(None, -32600, "Invalid Request"))

		session_id = request.headers.get("Mcp-Session-Id")

		# Log request info
		request_id = getattr(request.state, "request_id", str(uuid.uuid4())[:8])
		client_ip = request.client.host if request.client else "unknown"

		# Extract tool info
		tool_name = None
		arguments = {}
		if message.get("method") == "tools/call":
			params = message.get("params", {})
			tool_name = params.get("name")
			arguments = params.get("arguments", {})

		# Use internal service address (RAG service)
		rag_service_url = settings.rag_service_url
		response_data = await route_message(message, project, rag_service_url)

		duration_ms = (time.perf_counter() - start_time) * 1000

		# Log access
		if access_logger and tool_name:
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

		if response_data is None:
			return JSONResponse(content={"status": "ok"})

		response = JSONResponse(content=response_data)

		# Return new session id on initialize
		if message.get("method") == "initialize" and not session_id:
			response.headers["Mcp-Session-Id"] = str(uuid.uuid4())

		return response

	except json.JSONDecodeError:
		return JSONResponse(content=create_error(None, -32700, "Parse error"))
	except Exception as e:
		logger.error(f"MCP Error: {e}")
		return JSONResponse(content=create_error(None, -32603, str(e)))


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
