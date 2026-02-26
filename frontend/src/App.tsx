import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import Header from './components/Header';
import SetupGuide from './pages/SetupGuide/SetupGuide';
import Playground from './pages/Playground/Playground';
import Landing from './pages/Landing/Landing';
import Profile from './pages/Profile/Profile';

export default function App() {
	return (
		<ThemeProvider>
			<div className="app">
				<Header />
				<Routes>
					<Route path="/" element={<SetupGuide />} />
					<Route path="/playground" element={<Playground />} />
					<Route path="/landing" element={<Landing />} />
					<Route path="/profile" element={<Profile />} />
					<Route path="*" element={<Navigate to="/" replace />} />
				</Routes>
			</div>
		</ThemeProvider>
	);
}
