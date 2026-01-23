import axios from 'axios';
import type { SystemsResponse, CalendarResponse, StatsResponse, System, NewSystemsResponse, MissingSystemsResponse, ComplianceTrendingResponse, ComplianceCategoryResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const systemsApi = {
  // Get all systems with optional search and pagination
  getSystems: async (search?: string, page: number = 1, limit: number = 50): Promise<SystemsResponse> => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    
    const response = await api.get<SystemsResponse>(`/systems?${params.toString()}`);
    return response.data;
  },

  // Get a single system by shortname
  getSystem: async (shortname: string): Promise<System> => {
    const response = await api.get<System>(`/systems/${shortname}`);
    return response.data;
  },

  // Get calendar data for a system
  getCalendarData: async (
    shortname: string,
    year?: number,
    month?: number
  ): Promise<CalendarResponse> => {
    const params = new URLSearchParams();
    if (year !== undefined) params.append('year', year.toString());
    if (month !== undefined) params.append('month', month.toString());
    
    const response = await api.get<CalendarResponse>(
      `/systems/${shortname}/calendar?${params.toString()}`
    );
    return response.data;
  },

  // Get system history
  getHistory: async (
    shortname: string,
    startDate?: Date,
    endDate?: Date
  ) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate.toISOString());
    if (endDate) params.append('endDate', endDate.toISOString());
    
    const response = await api.get(
      `/systems/${shortname}/history?${params.toString()}`
    );
    return response.data;
  },

  // Get stats
  getStats: async (): Promise<StatsResponse> => {
    const response = await api.get<StatsResponse>('/systems/stats');
    return response.data;
  },

  // Get new systems today
  getNewSystemsToday: async (): Promise<NewSystemsResponse> => {
    const response = await api.get<NewSystemsResponse>('/systems/new-today');
    return response.data;
  },

  // Get missing systems
  getMissingSystems: async (daysThreshold: number = 7): Promise<MissingSystemsResponse> => {
    const params = new URLSearchParams();
    params.append('days', daysThreshold.toString());
    
    const response = await api.get<MissingSystemsResponse>(`/systems/missing?${params.toString()}`);
    return response.data;
  },

  // Get compliance trending data
  getComplianceTrending: async (days: number = 30, env?: string): Promise<ComplianceTrendingResponse> => {
    const params = new URLSearchParams();
    params.append('days', days.toString());
    if (env) {
      params.append('env', env);
    }
    
    const response = await api.get<ComplianceTrendingResponse>(`/systems/compliance-trending?${params.toString()}`);
    return response.data;
  },

  // Get systems by compliance category
  getSystemsByComplianceCategory: async (
    date: string,
    category: 'fully' | 'partially' | 'non' | 'new',
    env?: string
  ): Promise<ComplianceCategoryResponse> => {
    const params = new URLSearchParams();
    params.append('date', date);
    params.append('category', category);
    if (env) {
      params.append('env', env);
    }
    
    const response = await api.get<ComplianceCategoryResponse>(`/systems/compliance-category?${params.toString()}`);
    return response.data;
  },

  // Get unique environments
  getEnvironments: async (): Promise<{ environments: string[] }> => {
    const response = await api.get<{ environments: string[] }>('/systems/environments');
    return response.data;
  },
};

export const importApi = {
  // Upload CSV file
  uploadCsv: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/import/csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Import from file path
  importFromPath: async (filePath: string) => {
    const response = await api.post('/import/csv-path', { filePath });
    return response.data;
  },
};

export const healthApi = {
  // Health check
  check: async () => {
    const response = await api.get('/health');
    return response.data;
  },
};

export default api;
