"""MCP Server instructions builder - returned in initialize response"""

# 通用模板
INSTRUCTIONS_TEMPLATE = (
	"This server is a documentation knowledge base for {project_description}. "
	"It provides RAG-powered search over API docs, code examples, tutorials, and feature guides.\n"
	"\n"
	"Tools:\n"
	"- search: Query documentation using natural language. Returns ranked summaries with doc_id.\n"
	"- fetch: Retrieve full document content by doc_id from search results.\n"
	"- get_code_guidelines: Get CDN/npm import paths. Call BEFORE generating any code with script tags or imports.\n"
	"\n"
	"Workflow:\n"
	"1. Search with a natural language question describing what you need.\n"
	"2. Review summaries. Fetch full doc if a result looks relevant.\n"
	"3. Call get_code_guidelines before generating code with imports/script refs.\n"
	"4. Never assume API signatures from memory - always verify via search.\n"
	"\n"
	"{project_specific}"
)

# 各产品特化指引
PROJECT_INSTRUCTIONS = {
	"spreadjs": (
		"[SpreadJS] JavaScript spreadsheet component for browser. "
		"Frameworks: React (@mescius/spread-sheets-react), Vue (@mescius/spread-sheets-vue), Angular (@mescius/spread-sheets-angular), pure JS.\n"
		"Each framework has its own wrapper package - include the framework name in search queries "
		"(e.g. \"How to integrate SpreadJS with React\", \"SpreadJS Vue component setup\").\n"
		"Key topics: workbook, worksheet, cell binding, formulas, custom functions, "
		"charts, sparklines, pivot tables, table sheet, data manager, "
		"ribbon/toolbar, context menu, designer, "
		"shapes, comments, conditional formatting, cell types, cell styles, "
		"filtering, sorting, grouping, print, PDF export, "
		"Excel I/O (import/export), CSV, clipboard, "
		"events, commands, themes, touch support, collaboration.\n"
		"Always call get_code_guidelines before generating code with script tags or npm imports."
	),
	"gcexcel": (
		"[GcExcel] Server-side Excel-compatible spreadsheet API for .NET and Java. No UI - backend processing only.\n"
		"Key topics: workbook open/save, worksheet manipulation, Range operations, "
		"formulas, named styles, charts, shapes, pivot tables, "
		"conditional formatting, data validation, filtering, sorting, "
		"PDF export, image export, Excel I/O (.xlsx), CSV, "
		"template processing, SpreadJS JSON interop (toJSON/fromJSON), "
		"page setup, headers/footers, protection, comments.\n"
		"When searching, specify .NET or Java if the user's stack is known."
	),
	"wyn": (
		"[Wyn] Embedded BI and reporting platform. Web-based, multi-tenant.\n"
		"Key topics: dashboard design, report design, data sources, datasets, "
		"visualizations (chart types, tables, KPIs), parameters, filters, "
		"embedded integration (iframe, JS API), REST API, "
		"themes, localization, security (roles, permissions), "
		"multi-tenant architecture, scheduling, export (PDF, Excel).\n"
		"For embedding questions, search \"Wyn embedded integration\" or \"Wyn JavaScript API\"."
	),
	"forguncy": (
		"[Forguncy] Low-code web application development platform.\n"
		"Key topics: page design, cell types, list views, "
		"commands (page commands, server commands), workflows, "
		"data tables, relationships, views, "
		"user management, roles, permissions, "
		"plugins, JavaScript API (Forguncy.Page, Forguncy.Helper), "
		"scheduled tasks, deployment, mobile support.\n"
		"For custom logic, search \"Forguncy JavaScript API\" or \"Forguncy commands\"."
	),
}


def build_instructions(project: str, project_config=None) -> str:
	"""Build MCP instructions string for initialize response."""
	desc = project_config.get_description(project) if project_config else project
	specific = PROJECT_INSTRUCTIONS.get(project, "")
	return INSTRUCTIONS_TEMPLATE.format(
		project_description=desc,
		project_specific=specific,
	)
