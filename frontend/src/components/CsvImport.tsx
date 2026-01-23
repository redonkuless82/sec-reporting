import { useState } from 'react';
import { importApi } from '../services/api';

export default function CsvImport() {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const response = await importApi.uploadCsv(file);
      setResult(response);
      // Reload page after successful import
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to import CSV');
    } finally {
      setImporting(false);
      // Reset file input
      event.target.value = '';
    }
  };

  return (
    <div className="csv-import">
      <label htmlFor="csv-upload" className="import-button">
        {importing ? '⏳ Importing...' : '📥 Import Daily CSV'}
        <input
          id="csv-upload"
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          disabled={importing}
          style={{ display: 'none' }}
        />
      </label>

      {result && (
        <div className="import-result success">
          ✓ Imported {result.imported} records
          {result.errors > 0 && ` (${result.errors} errors)`}
        </div>
      )}

      {error && (
        <div className="import-result error">
          ✗ {error}
        </div>
      )}
    </div>
  );
}
