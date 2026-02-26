import { useState } from 'react';
import { useMcpSession } from '../../hooks/useMcpSession';
import SearchPanel from './SearchPanel';
import DocViewPanel from './DocViewPanel';
import RequestLog from '../../components/RequestLog';
import ToolInfoModal from '../../components/ToolInfoModal';
import type { McpTool } from '../../types/mcp';
import './Playground.css';

export default function Playground() {
	const session = useMcpSession();
	const [selectedTool, setSelectedTool] = useState<McpTool | null>(null);
	const [modalOpen, setModalOpen] = useState(false);

	const handleShowToolInfo = (tool: McpTool) => {
		setSelectedTool(tool);
		setModalOpen(true);
	};

	return (
		<div className="playground">
			<RequestLog entries={session.logEntries} />

			<div className="playground-grid">
				<SearchPanel
					tools={session.tools}
					searchResults={session.searchResults}
					isSearching={session.isSearching}
					isLoadingTools={session.isLoadingTools}
					currentProduct={session.currentProduct}
					error={session.error}
					onListTools={session.listTools}
					onSearch={session.search}
					onViewContent={session.viewContent}
					onFetchDoc={session.fetchDoc}
					onSwitchProduct={session.switchProduct}
					onShowToolInfo={handleShowToolInfo}
				/>
				<DocViewPanel
					content={session.docContent}
					isFetching={session.isFetching}
				/>
			</div>

			<ToolInfoModal
				tool={selectedTool}
				open={modalOpen}
				onClose={() => setModalOpen(false)}
			/>
		</div>
	);
}
