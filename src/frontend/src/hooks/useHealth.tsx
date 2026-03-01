import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export interface Product {
	id: string;
	name: string;
	endpoint: string;
}

interface HealthData {
	version: string;
	products: Product[];
}

const HealthContext = createContext<HealthData>({ version: '', products: [] });

export function HealthProvider({ children }: { children: ReactNode }) {
	const [data, setData] = useState<HealthData>({ version: '', products: [] });

	useEffect(() => {
		fetch('/health')
			.then((res) => res.json())
			.then((raw) => setData({
				version: raw.version ?? '',
				products: raw.products.map((p: { id: string; name: string; endpoint: string }) => ({
					id: p.id,
					name: p.name,
					endpoint: `${window.location.origin}${p.endpoint}`,
				})),
			}))
			.catch(() => {});
	}, []);

	return <HealthContext value={data}>{children}</HealthContext>;
}

export function useHealth(): HealthData {
	return useContext(HealthContext);
}

export function useActiveProducts(): Product[] {
	return useHealth().products;
}

export function useVersion(): string {
	return useHealth().version;
}
