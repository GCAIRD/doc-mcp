import { useState, useEffect } from 'react';
import type { ProductId } from '../lib/config';

interface HealthResponse {
	status: string;
	products: { id: ProductId; lang: string; collection: string; endpoint: string }[];
}

export function useActiveProducts(): ProductId[] {
	const [products, setProducts] = useState<ProductId[]>([]);

	useEffect(() => {
		fetch('/health')
			.then((res) => res.json())
			.then((data: HealthResponse) => setProducts(data.products.map((p) => p.id)))
			.catch(() => setProducts(['spreadjs']));
	}, []);

	return products;
}
