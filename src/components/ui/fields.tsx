import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { radius, spacing } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useTheme';

/**
 * Form fields that replace raw keypad entry wherever the value has a
 * natural structure: dates get the native calendar picker, bounded
 * numbers get a stepper, height gets feet and inches.
 */

/** yyyy-mm-dd date field. Native picker on iOS/Android, date input on web. */
export function FieldDate({
  value,
  onChange,
  placeholder = 'Pick a date',
  minimumDate,
  maximumDate,
}: {
  value: string; // yyyy-mm-dd or ''
  onChange: (iso: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const parsed = value && !isNaN(new Date(value + 'T12:00:00').getTime())
    ? new Date(value + 'T12:00:00')
    : null;

  if (Platform.OS === 'web') {
    // The browser's own date input is the right control on web.
    return (
      <input
        type="date"
        value={value}
        min={minimumDate?.toISOString().slice(0, 10)}
        max={maximumDate?.toISOString().slice(0, 10)}
        onChange={(e: any) => onChange(e.target.value)}
        style={{
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          padding: '10px 12px',
          fontSize: 15,
          color: theme.textPrimary,
          background: theme.surface,
          width: '100%',
          boxSizing: 'border-box' as any,
        }}
      />
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DateTimePicker = require('@react-native-community/datetimepicker').default;

  return (
    <View>
      <Pressable
        onPress={() => setOpen(!open)}
        style={{
          borderWidth: 1,
          borderColor: open ? theme.accent : theme.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 12,
          backgroundColor: theme.surface,
        }}
      >
        <Text style={{ fontSize: 15, color: parsed ? theme.textPrimary : theme.textMuted }}>
          {parsed
            ? parsed.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })
            : placeholder}
        </Text>
      </Pressable>
      {open && (
        <View
          style={{
            marginTop: spacing.xs,
            borderRadius: radius.md,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            overflow: 'hidden',
          }}
        >
          <DateTimePicker
            value={parsed ?? new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            themeVariant={theme.mode}
            accentColor={theme.accent}
            onChange={(event: any, date?: Date) => {
              if (Platform.OS !== 'ios') setOpen(false);
              if (event.type === 'dismissed' || !date) return;
              onChange(date.toISOString().slice(0, 10));
              if (Platform.OS === 'ios' && event.type === 'set') setOpen(false);
            }}
          />
        </View>
      )}
    </View>
  );
}

/** Bounded numeric field with minus/plus steppers and a tappable readout. */
export function FieldStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (v: number) => string;
}) {
  const theme = useAppTheme();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const btn = (label: string, delta: number) => (
    <Pressable
      onPress={() => onChange(clamp(value + delta))}
      onLongPress={() => onChange(clamp(value + delta * 5))}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed
          ? theme.accent
          : theme.mode === 'dark'
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(0,0,0,0.06)',
      })}
    >
      {({ pressed }) => (
        <Text style={{ fontSize: 20, fontWeight: '700', color: pressed ? '#fff' : theme.textPrimary }}>
          {label}
        </Text>
      )}
    </Pressable>
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 10,
        backgroundColor: theme.surface,
        padding: 4,
        gap: 4,
      }}
    >
      {btn('−', -step)}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: theme.textPrimary, fontVariant: ['tabular-nums'] }}>
          {format ? format(value) : `${value}`}
          {unit ? <Text style={{ fontSize: 12, fontWeight: '500', color: theme.textMuted }}> {unit}</Text> : null}
        </Text>
      </View>
      {btn('+', step)}
    </View>
  );
}

/** Height entry in feet and inches (or cm for metric users). */
export function FieldHeight({
  heightCm,
  onChange,
  metric,
}: {
  heightCm: number | null;
  onChange: (cm: number | null) => void;
  metric: boolean;
}) {
  const theme = useAppTheme();
  const cm = heightCm ?? 173;

  if (metric) {
    return (
      <FieldStepper
        value={Math.round(cm)}
        onChange={(v) => onChange(v)}
        min={120}
        max={220}
        unit="cm"
      />
    );
  }

  const totalIn = Math.round(cm / 2.54);
  const feet = Math.floor(totalIn / 12);
  const inches = totalIn % 12;
  const set = (f: number, i: number) => onChange(Math.round((f * 12 + i) * 2.54));

  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <FieldStepper value={feet} onChange={(f) => set(f, inches)} min={4} max={7} unit="ft" />
      </View>
      <View style={{ flex: 1 }}>
        <FieldStepper value={inches} onChange={(i) => set(feet, i)} min={0} max={11} unit="in" />
      </View>
      <View style={{ justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, color: theme.textMuted }}>{`${feet}'${inches}"`}</Text>
      </View>
    </View>
  );
}
