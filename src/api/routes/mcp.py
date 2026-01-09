"""MCP 路由 - 统一端点，URL路径区分项目"""

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
	"""根据项目动态生成工具定义"""
	if project:
		# 固定项目模式：不需要 project 参数
		if project_config:
			proj_desc = project_config.get_description(project) or project
		else:
			proj_desc = project
		return {
			"search": {
				"description": f"搜索 {proj_desc} 中文文档。返回相关代码示例、API 文档和功能说明。",
				"inputSchema": {
					"type": "object",
					"properties": {
						"query": {
							"type": "string",
							"description": "搜索查询（使用中文效果最佳）",
						},
						"limit": {
							"type": "integer",
							"description": "返回结果数量",
							"default": 5,
						},
					},
					"required": ["query"],
				},
			},
			"fetch": {
				"description": f"根据 doc_id 获取 {proj_desc} 完整文档内容。",
				"inputSchema": {
					"type": "object",
					"properties": {
						"doc_id": {
							"type": "string",
							"description": "搜索结果中的文档 ID",
						}
					},
					"required": ["doc_id"],
				},
			},
		}
	else:
		# 多项目模式：从 project_config 动态获取项目列表
		project_names = project_config.project_names if project_config else ["spreadjs", "gcexcel"]
		return {
			"search": {
				"description": "搜索 GrapeCity Docs 产品文档。返回相关代码示例、API 文档和功能说明。",
				"inputSchema": {
					"type": "object",
					"properties": {
						"query": {
							"type": "string",
							"description": "搜索查询（使用中文效果最佳）",
						},
						"project": {
							"type": "string",
							"description": f"项目：{' 或 '.join(project_names)}",
							"enum": project_names,
						},
						"limit": {
							"type": "integer",
							"description": "返回结果数量",
							"default": 5,
						},
					},
					"required": ["query", "project"],
				},
			},
			"fetch": {
				"description": "根据 doc_id 获取完整文档内容。",
				"inputSchema": {
					"type": "object",
					"properties": {
						"doc_id": {"type": "string", "description": "文档 ID"},
						"project": {
							"type": "string",
							"description": f"项目：{' 或 '.join(project_names)}",
							"enum": project_names,
						},
					},
					"required": ["doc_id", "project"],
				},
			},
		}


def create_response(message_id: str | int | None, result: dict) -> dict:
	return {"jsonrpc": "2.0", "id": message_id, "result": result}


def create_error(message_id: str | int | None, code: int, message: str) -> dict:
	return {
		"jsonrpc": "2.0",
		"id": message_id,
		"error": {"code": code, "message": message},
	}


async def handle_search(args: dict, project: str, rag_service_url: str) -> dict:
	"""执行 RAG 搜索"""
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
	return resp.json()


async def handle_fetch(args: dict, project: str, rag_service_url: str) -> dict:
	"""获取完整文档"""
	from ..app import get_http_client
	client = get_http_client()
	resp = await client.get(
		f"{rag_service_url}/doc/{args['doc_id']}",
		params={"project": project},
	)
	resp.raise_for_status()
	return resp.json()


async def route_message(
	message: dict, project: str | None, rag_service_url: str
) -> dict | None:
	"""路由 MCP 消息"""
	method = message.get("method")
	message_id = message.get("id")
	params = message.get("params", {})

	if method == "initialize":
		return create_response(
			message_id,
			{
				"protocolVersion": "2025-03-26",
				"capabilities": {"tools": {}},
				"serverInfo": {"name": "GC-DOC-MCP-Server", "version": "1.0.0"},
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

		# 如果URL指定了project，使用URL中的project
		actual_project = project or arguments.get("project")
		if not actual_project:
			return create_error(message_id, -32002, "project is required")

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
	"""MCP POST - 通用端点（需要在参数中指定project）"""
	return await _handle_mcp_request(request, project=None)


@router.post("/mcp/{project}")
async def mcp_project(request: Request, project: str):
	"""MCP POST - 项目专用端点"""
	return await _handle_mcp_request(request, project=project)


async def _handle_mcp_request(request: Request, project: str | None):
	"""处理 MCP 请求"""
	from ..app import get_access_logger, get_settings

	settings = get_settings()
	access_logger = get_access_logger()
	start_time = time.perf_counter()

	try:
		message = await request.json()
		if message.get("jsonrpc") != "2.0" or "method" not in message:
			return JSONResponse(content=create_error(None, -32600, "Invalid Request"))

		session_id = request.headers.get("Mcp-Session-Id")

		# 记录请求信息
		request_id = getattr(request.state, "request_id", str(uuid.uuid4())[:8])
		client_ip = request.client.host if request.client else "unknown"

		# 提取工具信息
		tool_name = None
		arguments = {}
		if message.get("method") == "tools/call":
			params = message.get("params", {})
			tool_name = params.get("name")
			arguments = params.get("arguments", {})

		# 使用内部服务地址（RAG service）
		rag_service_url = settings.rag_service_url
		response_data = await route_message(message, project, rag_service_url)

		duration_ms = (time.perf_counter() - start_time) * 1000

		# 记录访问日志
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

		# 初始化时返回新 session id
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
	"""列出所有工具"""
	from ..app import get_project_config
	tools_list = [{"name": name, **defn} for name, defn in get_tools(None, get_project_config()).items()]
	return JSONResponse(content={"jsonrpc": "2.0", "result": {"tools": tools_list}})


@router.get("/initialize")
@router.post("/initialize")
async def initialize():
	"""MCP 初始化"""
	return JSONResponse(
		content={
			"jsonrpc": "2.0",
			"result": {
				"protocolVersion": "2025-03-26",
				"capabilities": {"tools": {}},
				"serverInfo": {"name": "GC-DOC-MCP-Server", "version": "1.0.0"},
			},
		}
	)
