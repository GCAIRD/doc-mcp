import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export interface Product {
	id: string;
	name: string;
	endpoint: string;
}

type HealthStatus = 'loading' | 'connected' | 'error';

interface HealthData {
	version: string;
	products: Product[];
	status: HealthStatus;
	error: string | null;
}

const INITIAL: HealthData = { version: '', products: [], status: 'loading', error: null };

const HealthContext = createContext<HealthData>(INITIAL);

export function HealthProvider({ children }: { children: ReactNode }) {
	const [data, setData] = useState<HealthData>(INITIAL);

	useEffect(() => {
		const fetchHealth = async () => {
			try {
				// DEBUG: uncomment to test UI states
				// await new Promise(r => setTimeout(r, 3000));  // slow connection
				// throw new Error('Debug: forced error');        // backend unreachable

				const res = await fetch('/health');
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const raw = await res.json();
				setData({
					version: raw.version ?? '',
					products: raw.products.map((p: { id: string; name: string; endpoint: string }) => ({
						id: p.id,
						name: p.name,
						endpoint: `${window.location.origin}${p.endpoint}`,
					})),
					status: 'connected',
					error: null,
				});
			} catch (err) {
				setData({
					version: '',
					products: [],
					status: 'error',
					error: err instanceof Error ? err.message : String(err),
				});
			}
		};
		fetchHealth();
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
