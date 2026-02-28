interface ToolChipProps {
	name: string;
	onClick: () => void;
}

export default function ToolChip({ name, onClick }: ToolChipProps) {
	return (
		<button className="tool-chip" onClick={onClick}>
			{name}
		</button>
	);
}
