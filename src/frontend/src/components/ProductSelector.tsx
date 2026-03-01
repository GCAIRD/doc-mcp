import { useActiveProducts } from '../hooks/useActiveProducts';

interface ProductSelectorProps {
	value: string;
	onChange: (productId: string) => void;
}

export default function ProductSelector({ value, onChange }: ProductSelectorProps) {
	const products = useActiveProducts();

	return (
		<select
			className="product-select"
			value={value}
			onChange={(e) => onChange(e.target.value)}
		>
			{products.map((p) => (
				<option key={p.id} value={p.id}>
					{p.name}
				</option>
			))}
		</select>
	);
}
