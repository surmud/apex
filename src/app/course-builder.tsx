import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Card, GhostButton, PrimaryButton } from '../components/ui/primitives';
import { LibraryCourse, searchCourses } from '../lib/data/courseLibrary';
import { useAppState } from '../lib/state/AppState';
import { spacing } from '../theme/tokens';
import { useAppTheme } from '../theme/useTheme';

export default function CourseBuilder() {
  const theme = useAppTheme();
  const { addCourse, profile } = useAppState();

  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const results = useMemo(() => searchCourses(query).slice(0, 6), [query]);

  const [name, setName] = useState('');
  const [distance, setDistance] = useState('26.2');
  const [gain, setGain] = useState('');
  const [raceDate, setRaceDate] = useState('');
  const [temp, setTemp] = useState('');
  const [humidity, setHumidity] = useState('');
  const [climbs, setClimbs] = useState<{ mile: string; label: string }[]>([]);

  const mi = profile.units === 'mi_f';

  const inputStyle = {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.textPrimary,
    backgroundColor: theme.surface,
  } as const;

  function applyLibraryCourse(c: LibraryCourse) {
    setName(c.name);
    setDistance(mi ? String(c.distanceMi) : (c.distanceMi * 1.609344).toFixed(1));
    setGain(mi ? String(c.elevationGainFt) : String(Math.round(c.elevationGainFt * 0.3048)));
    setTemp(mi ? String(c.typicalTempF) : String(Math.round((c.typicalTempF - 32) / 1.8)));
    setHumidity(String(c.typicalHumidityPct));
    setClimbs(c.keyFeatures.map((f) => ({ mile: String(f.mile), label: f.label })));
    setShowResults(false);
    setQuery(c.name);
  }

  function save() {
    if (!name || !Number(distance)) return;
    addCourse({
      name,
      distanceM: Number(distance) * (mi ? 1609.344 : 1000),
      elevationGainM: Number(gain || 0) * (mi ? 0.3048 : 1),
      raceDate: raceDate || null,
      expectedTempC: temp ? (mi ? (Number(temp) - 32) / 1.8 : Number(temp)) : null,
      expectedHumidityPct: humidity ? Number(humidity) : null,
      keyFeatures: climbs
        .filter((c) => c.mile && c.label)
        .map((c) => ({ mile: Number(c.mile), label: c.label })),
    });
    router.back();
  }

  const Label = ({ children }: { children: string }) => (
    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 }}>{children}</Text>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.page }}
      contentContainerStyle={{ padding: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center', gap: spacing.lg, paddingBottom: 40 }}
    >
      <View>
        <Label>Search well-known races</Label>
        <TextInput
          style={inputStyle}
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          placeholder="Boston, NYC, Chicago..."
          placeholderTextColor={theme.textMuted}
        />
        {showResults && query.length > 0 && (
          <Card style={{ marginTop: spacing.sm, padding: spacing.sm }}>
            {results.length === 0 ? (
              <Text style={{ fontSize: 13, color: theme.textMuted, padding: spacing.sm }}>
                Nothing matching. Enter the details manually below.
              </Text>
            ) : (
              results.map((c) => (
                <Pressable
                  key={c.name}
                  onPress={() => applyLibraryCourse(c)}
                  style={({ pressed }) => ({
                    paddingVertical: 10,
                    paddingHorizontal: spacing.sm,
                    borderRadius: 8,
                    backgroundColor: pressed ? theme.surfaceRaised : 'transparent',
                  })}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary }}>{c.name}</Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>
                    {c.location}. {c.distanceMi} mi, {c.elevationGainFt} ft gain, typically {c.month}.
                  </Text>
                </Pressable>
              ))
            )}
          </Card>
        )}
      </View>

      <View>
        <Label>Course name</Label>
        <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="NYC Marathon" placeholderTextColor={theme.textMuted} />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Label>{`Distance (${mi ? 'mi' : 'km'})`}</Label>
          <TextInput style={inputStyle} value={distance} onChangeText={setDistance} keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>{`Elev gain (${mi ? 'ft' : 'm'})`}</Label>
          <TextInput style={inputStyle} value={gain} onChangeText={setGain} keyboardType="numeric" placeholder="810" placeholderTextColor={theme.textMuted} />
        </View>
      </View>

      <View>
        <Label>Race date (YYYY-MM-DD, optional)</Label>
        <TextInput style={inputStyle} value={raceDate} onChangeText={setRaceDate} placeholder="2026-11-01" placeholderTextColor={theme.textMuted} />
      </View>

      <Card>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: spacing.sm }}>
          Expected conditions (optional)
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Label>{`Temp (°${mi ? 'F' : 'C'})`}</Label>
            <TextInput style={inputStyle} value={temp} onChangeText={setTemp} keyboardType="numeric" placeholder={mi ? '52' : '11'} placeholderTextColor={theme.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Humidity (%)</Label>
            <TextInput style={inputStyle} value={humidity} onChangeText={setHumidity} keyboardType="numeric" placeholder="60" placeholderTextColor={theme.textMuted} />
          </View>
        </View>
      </Card>

      <Card>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: 2 }}>
          Key features (optional)
        </Text>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginBottom: spacing.sm }}>
          Major climbs show up as pace bumps in the split profile.
        </Text>
        {climbs.map((c, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            <TextInput
              style={[inputStyle, { width: 80 }]}
              value={c.mile}
              onChangeText={(v) => setClimbs(climbs.map((x, j) => (j === i ? { ...x, mile: v } : x)))}
              keyboardType="numeric"
              placeholder="mi"
              placeholderTextColor={theme.textMuted}
            />
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              value={c.label}
              onChangeText={(v) => setClimbs(climbs.map((x, j) => (j === i ? { ...x, label: v } : x)))}
              placeholder="Queensboro Bridge"
              placeholderTextColor={theme.textMuted}
            />
          </View>
        ))}
        <GhostButton title="+ Add climb" onPress={() => setClimbs([...climbs, { mile: '', label: '' }])} />
      </Card>

      <PrimaryButton title="Save course" onPress={save} disabled={!name || !Number(distance)} />
    </ScrollView>
  );
}
