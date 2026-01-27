import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { EnvironmentProvider } from './contexts/EnvironmentContext';
import Home from './pages/Home';
import AnalyticsDetailPage from './pages/AnalyticsDetailPage';
import './App.css';

function App() {
  return (
    <EnvironmentProvider>
      <Router>
        <div className="app">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/analytics/details" element={<AnalyticsDetailPage />} />
          </Routes>
        </div>
      </Router>
    </EnvironmentProvider>
  );
}

export default App;
