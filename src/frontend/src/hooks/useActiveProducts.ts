import { useState, useEffect } from 'react';

export interface Product {
	id: string;
	name: string;
	endpoint: string;
}

export function useActiveProducts(): Product[] {
	const [products, setProducts] = useState<Product[]>([]);

	useEffect(() => {
		fetch('/health')
			.then((res) => res.json())
			.then((data) => setProducts(
				data.products.map((p: { id: string; name: string; endpoint: string }) => ({
					id: p.id,
					name: p.name,
					endpoint: `${window.location.origin}${p.endpoint}`,
				}))
			))
			.catch(() => {});
	}, []);

	return products;
}
