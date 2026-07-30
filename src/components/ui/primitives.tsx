import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { radius, spacing, Theme } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useTheme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          padding: spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, marginTop: spacing.xl }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {children}
      </Text>
      {right}
    </View>
  );
}

export function StatValue({ label, value, delta, deltaGood }: { label: string; value: string; delta?: string; deltaGood?: boolean }) {
  const theme = useAppTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: '700', color: theme.textPrimary, fontVariant: ['tabular-nums'] }}>{value}</Text>
      {delta != null && (
        <Text style={{ fontSize: 12, fontWeight: '600', marginTop: 2, color: deltaGood ? theme.deltaGood : theme.textMuted }}>
          {delta}
        </Text>
      )}
    </View>
  );
}

export function Pill({
  label,
  selected,
  onPress,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: string;
}) {
  const theme = useAppTheme();
  const c = color ?? theme.accent;
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: selected ? c : 'transparent',
        borderWidth: 1,
        borderColor: selected ? c : theme.border,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: selected ? '#fff' : theme.textSecondary }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
        borderRadius: radius.sm + 2,
        padding: 2,
      }}
    >
      {options.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onChange(o.key)}
          style={{
            flex: 1,
            paddingVertical: 6,
            borderRadius: radius.sm,
            backgroundColor: value === o.key ? theme.surfaceRaised : 'transparent',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: value === o.key ? '700' : '500',
              color: value === o.key ? theme.textPrimary : theme.textMuted,
            }}
          >
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Badge({ label, color, subtle }: { label: string; color: string; subtle?: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: subtle ? `${color}22` : color,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', color: subtle ? color : '#fff' }}>{label}</Text>
    </View>
  );
}

export function statusColor(status: string, theme: Theme): string {
  switch (status) {
    case 'optimal': return theme.status.good;
    case 'caution': return theme.status.warning;
    case 'high_risk': return theme.status.critical;
    case 'undertraining': return theme.status.serious;
    default: return theme.textMuted;
  }
}

export function PrimaryButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: disabled ? theme.textMuted : theme.accent,
        opacity: pressed ? 0.85 : 1,
        paddingVertical: 14,
        borderRadius: radius.md,
        alignItems: 'center',
      })}
    >
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
}

export function GhostButton({ title, onPress }: { title: string; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 12,
        borderRadius: radius.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: theme.textSecondary, fontSize: 15, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}
