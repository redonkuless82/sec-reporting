import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { EnvironmentProvider } from './contexts/EnvironmentContext';
import Home from './pages/Home';
import './App.css';

function App() {
  return (
    <EnvironmentProvider>
      <Router>
        <div className="app">
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </div>
      </Router>
    </EnvironmentProvider>
  );
}

export default App;
