import { useEffect, useState } from 'react';

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
  filterable?: boolean;
  searchPlaceholder?: string;
  noMatchesHint?: string;
  /** When the user clicks the already-selected option, expand or reset the list. */
  onReselectSelected?: () => void;
}

function filterCatalogOptions(
  options: ImportCatalogOption[],
  query: string,
  selectedValue: string,
): ImportCatalogOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  return options.filter(
    (option) =>
      option.value === selectedValue || option.label.toLowerCase().includes(normalized),
  );
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
  filterable = false,
  searchPlaceholder = 'Type to filter…',
  noMatchesHint = 'No matches.',
  onReselectSelected,
}: ImportCatalogPickerProps) {
  const listId = `${label.replace(/\s+/g, '-').toLowerCase()}-list`;
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    if (!loading) {
      setFilterText('');
    }
  }, [loading, options.length]);

  const filteredOptions = filterable
    ? filterCatalogOptions(options, filterText, value)
    : options;

  return (
    <div
      className={`welcome-pref-field import-catalog-picker${filterable ? ' import-catalog-picker-filterable' : ''}`}
    >
      <span className="import-catalog-picker-label">{label}</span>
      {filterable && !loading && options.length > 0 && (
        <input
          type="search"
          className="import-catalog-picker-filter"
          value={filterText}
          disabled={disabled}
          placeholder={searchPlaceholder}
          aria-label={`${label} filter`}
          onChange={(event) => setFilterText(event.target.value)}
        />
      )}
      <select
        className="import-catalog-picker-native"
        value={value}
        disabled={disabled || options.length === 0}
        aria-label={label}
        onMouseDown={(event) => {
          if (!value || !onReselectSelected || disabled) return;
          event.preventDefault();
          onReselectSelected();
        }}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {filteredOptions.map((option) => (
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
        ) : filteredOptions.length === 0 ? (
          <p className="import-catalog-picker-empty">{noMatchesHint}</p>
        ) : (
          filteredOptions.map((option) => {
            const selected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                className={`import-catalog-picker-option${selected ? ' selected' : ''}`}
                onClick={() => {
                  if (selected && onReselectSelected) {
                    onReselectSelected();
                    return;
                  }
                  onChange(option.value);
                }}
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
