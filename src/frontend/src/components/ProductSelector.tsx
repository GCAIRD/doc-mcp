import { PRODUCTS, type ProductId } from '../lib/config';

const PRODUCT_LABELS: Record<ProductId, string> = {
	spreadjs: 'SpreadJS',
	gcexcel: 'GcExcel',
	forguncy: 'Forguncy',
	wyn: 'Wyn',
};

interface ProductSelectorProps {
	value: ProductId;
	onChange: (productId: ProductId) => void;
}

export default function ProductSelector({ value, onChange }: ProductSelectorProps) {
	return (
		<select
			className="product-select"
			value={value}
			onChange={(e) => onChange(e.target.value as ProductId)}
		>
			{PRODUCTS.map((id) => (
				<option key={id} value={id}>
					{PRODUCT_LABELS[id]}
				</option>
			))}
		</select>
	);
}
