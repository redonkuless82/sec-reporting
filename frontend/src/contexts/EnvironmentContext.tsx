import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { systemsApi } from '../services/api';

interface EnvironmentContextType {
  selectedEnvironment: string;
  setSelectedEnvironment: (env: string) => void;
  environments: string[];
  environmentsLoading: boolean;
  refreshEnvironments: () => Promise<void>;
}

const EnvironmentContext = createContext<EnvironmentContextType | undefined>(undefined);

const STORAGE_KEY = 'tooling-health-selected-environment';

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [selectedEnvironment, setSelectedEnvironmentState] = useState<string>('');
  const [environments, setEnvironments] = useState<string[]>([]);
  const [environmentsLoading, setEnvironmentsLoading] = useState(true);

  // Load selected environment from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSelectedEnvironmentState(stored);
    }
  }, []);

  // Load available environments on mount
  useEffect(() => {
    loadEnvironments();
  }, []);

  const loadEnvironments = async () => {
    setEnvironmentsLoading(true);
    try {
      const response = await systemsApi.getEnvironments();
      setEnvironments(response.environments);
    } catch (err) {
      console.error('Error loading environments:', err);
      setEnvironments([]);
    } finally {
      setEnvironmentsLoading(false);
    }
  };

  const setSelectedEnvironment = (env: string) => {
    setSelectedEnvironmentState(env);
    // Persist to localStorage
    if (env) {
      localStorage.setItem(STORAGE_KEY, env);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const refreshEnvironments = async () => {
    await loadEnvironments();
  };

  return (
    <EnvironmentContext.Provider
      value={{
        selectedEnvironment,
        setSelectedEnvironment,
        environments,
        environmentsLoading,
        refreshEnvironments,
      }}
    >
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment() {
  const context = useContext(EnvironmentContext);
  if (context === undefined) {
    throw new Error('useEnvironment must be used within an EnvironmentProvider');
  }
  return context;
}
