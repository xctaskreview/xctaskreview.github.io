export interface ImportCatalogOption {
  value: string;
  label: string;
}

interface ImportCatalogPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  loadingHint?: string;
  placeholder: string;
  options: ImportCatalogOption[];
  emptyHint?: string;
}

export function ImportCatalogPicker({
  label,
  value,
  onChange,
  disabled = false,
  loading = false,
  loadingHint = 'Loading tasks…',
  placeholder,
  options,
  emptyHint,
}: ImportCatalogPickerProps) {
  const listId = `${label.replace(/\s+/g, '-').toLowerCase()}-list`;

  return (
    <div className="welcome-pref-field import-catalog-picker">
      <span className="import-catalog-picker-label">{label}</span>
      <select
        className="import-catalog-picker-native"
        value={value}
        disabled={disabled || options.length === 0}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div
        id={listId}
        className={`import-catalog-picker-list${disabled ? ' disabled' : ''}`}
        role="listbox"
        aria-label={label}
        aria-disabled={disabled || options.length === 0}
      >
        {loading ? (
          <p className="import-catalog-picker-empty import-catalog-picker-loading">{loadingHint}</p>
        ) : options.length === 0 ? (
          <p className="import-catalog-picker-empty">{emptyHint ?? placeholder}</p>
        ) : (
          options.map((option) => {
            const selected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                className={`import-catalog-picker-option${selected ? ' selected' : ''}`}
                onClick={() => onChange(option.value)}
              >
                {option.label}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
