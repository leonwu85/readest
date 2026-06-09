import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  TypographyEnhancementConfig,
  TypographyEnhancementKey,
  TypographyEnhancementItem,
} from '@/types/book';
import { normalizeTypographyEnhancement } from '@/utils/typographyEnhancement';
import { BoxedList, SettingsRow } from '../primitives';
import ColorInput from './ColorInput';

interface TypographyEnhancementSettingsProps {
  typographyEnhancement: TypographyEnhancementConfig;
  onChange: (config: TypographyEnhancementConfig) => void;
  'data-setting-id'?: string;
}

const TYPOGRAPHY_ROWS: {
  key: TypographyEnhancementKey;
  label: string;
  colorLabel: string;
}[] = [
  {
    key: 'bookTitle',
    label: 'Highlight Book Titles',
    colorLabel: 'Book Title Highlight Color',
  },
  {
    key: 'information',
    label: 'Highlight Information',
    colorLabel: 'Information Highlight Color',
  },
  {
    key: 'dialogue',
    label: 'Highlight Dialogue',
    colorLabel: 'Dialogue Highlight Color',
  },
];

const TypographyEnhancementSettings: React.FC<TypographyEnhancementSettingsProps> = ({
  typographyEnhancement,
  onChange,
  'data-setting-id': dataSettingId,
}) => {
  const _ = useTranslation();
  const value = normalizeTypographyEnhancement(typographyEnhancement);

  const updateItem = (key: TypographyEnhancementKey, patch: Partial<TypographyEnhancementItem>) => {
    onChange({
      ...value,
      [key]: {
        ...value[key],
        ...patch,
      },
    });
  };

  return (
    <BoxedList title={_('Typography Enhancement')} data-setting-id={dataSettingId}>
      {TYPOGRAPHY_ROWS.map((row) => {
        const item = value[row.key];
        return (
          <SettingsRow key={row.key} label={_(row.label)}>
            <div className='flex items-center gap-3'>
              {item.enabled && (
                <ColorInput
                  label={_(row.colorLabel)}
                  value={item.color}
                  onChange={(color) => updateItem(row.key, { color })}
                  swatchOnly
                  showPickerIcon
                  pickerPosition='right'
                />
              )}
              <input
                type='checkbox'
                className='toggle'
                checked={item.enabled}
                onChange={() => updateItem(row.key, { enabled: !item.enabled })}
              />
            </div>
          </SettingsRow>
        );
      })}
    </BoxedList>
  );
};

export default TypographyEnhancementSettings;
