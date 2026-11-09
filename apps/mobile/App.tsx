import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { THEME_COLORS } from '@kerala-tourism/constants';

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" backgroundColor={THEME_COLORS.FOREST_GREEN} />

      {/* Mobile Top App Bar */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>KT</Text>
          </View>
          <View>
            <Text style={styles.brandTitle}>Kerala Tourism</Text>
            <Text style={styles.brandSubtitle}>God's Own Country</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.qrButton}>
          <Text style={styles.qrButtonText}>QR Pass</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Nearby GPS Pulse Card */}
        <View style={styles.gpsBanner}>
          <View style={styles.pulseDot} />
          <Text style={styles.gpsText}>GPS Active: Wayanad Rainforest Buffer (1.2 km away)</Text>
        </View>

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroTag}>FEATURED ECO-TRAIL</Text>
          <Text style={styles.heroTitle}>Meenmutty Falls & Banasura Sagar Trek</Text>
          <Text style={styles.heroSubtitle}>
            Certified Family-Safe • Forest Dept Clearance Active
          </Text>

          <TouchableOpacity style={styles.heroActionBtn}>
            <Text style={styles.heroActionBtnText}>Explore Trails & Audio Guide</Text>
          </TouchableOpacity>
        </View>

        {/* Hourly Stays Fast Pass */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Hourly Transit Stays</Text>
          <Text style={styles.sectionLink}>View All</Text>
        </View>

        <View style={styles.transitCard}>
          <View style={styles.transitHeader}>
            <Text style={styles.transitName}>Vythiri Tea Estate Pod</Text>
            <Text style={styles.transitPrice}>₹850 / 3 hrs</Text>
          </View>
          <Text style={styles.transitDesc}>
            Includes power backup, shower, high-speed Wi-Fi, and 1-hour sanitization guarantee.
          </Text>
          <View style={styles.slotRow}>
            {['3h Slot (₹850)', '6h Slot (₹1,500)', 'Overnight Stay'].map((slot, index) => (
              <View key={index} style={styles.slotPill}>
                <Text style={styles.slotPillText}>{slot}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Community Feed Preview */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Live Community Feed</Text>
          <Text style={styles.sectionLink}>Share Story</Text>
        </View>

        <View style={styles.communityCard}>
          <Text style={styles.communityUser}>Ananya Mohan • 2h ago</Text>
          <Text style={styles.communityPost}>
            "The morning mist over Alleppey backwaters today. Water lilies are blooming everywhere!"
          </Text>
        </View>
      </ScrollView>

      {/* Native Bottom Dock */}
      <View style={styles.bottomDock}>
        {[
          { label: 'Explore', active: true },
          { label: 'Map', active: false },
          { label: 'Stays', active: false },
          { label: 'Social', active: false },
          { label: 'Profile', active: false },
        ].map((item, index) => (
          <TouchableOpacity key={index} style={styles.dockItem}>
            <Text
              style={[
                styles.dockItemText,
                item.active && { color: THEME_COLORS.FOREST_GREEN, fontWeight: '700' },
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME_COLORS.WARM_CREAM,
  },
  header: {
    backgroundColor: THEME_COLORS.FOREST_GREEN,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: THEME_COLORS.SUNSET_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeText: {
    fontWeight: '800',
    color: THEME_COLORS.CHARCOAL,
    fontSize: 13,
  },
  brandTitle: {
    color: THEME_COLORS.WARM_CREAM,
    fontWeight: '700',
    fontSize: 16,
  },
  brandSubtitle: {
    color: THEME_COLORS.WARM_CREAM,
    fontSize: 10,
    opacity: 0.8,
  },
  qrButton: {
    backgroundColor: THEME_COLORS.SUNSET_ORANGE,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  qrButtonText: {
    color: THEME_COLORS.CHARCOAL,
    fontWeight: '700',
    fontSize: 12,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  gpsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  gpsText: {
    color: THEME_COLORS.FOREST_GREEN,
    fontSize: 12,
    fontWeight: '600',
  },
  heroCard: {
    backgroundColor: THEME_COLORS.FOREST_GREEN,
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
  },
  heroTag: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME_COLORS.SUNSET_ORANGE,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
    lineHeight: 26,
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#D1E7DD',
    marginBottom: 16,
  },
  heroActionBtn: {
    backgroundColor: THEME_COLORS.SUNSET_ORANGE,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  heroActionBtnText: {
    color: THEME_COLORS.CHARCOAL,
    fontWeight: '700',
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME_COLORS.CHARCOAL,
  },
  sectionLink: {
    fontSize: 12,
    color: THEME_COLORS.FOREST_GREEN,
    fontWeight: '600',
  },
  transitCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  transitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  transitName: {
    fontWeight: '700',
    fontSize: 14,
    color: THEME_COLORS.CHARCOAL,
  },
  transitPrice: {
    fontWeight: '800',
    fontSize: 14,
    color: THEME_COLORS.FOREST_GREEN,
  },
  transitDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 12,
  },
  slotRow: {
    flexDirection: 'row',
    gap: 8,
  },
  slotPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  slotPillText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  communityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  communityUser: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  communityPost: {
    fontSize: 13,
    color: THEME_COLORS.CHARCOAL,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  dockItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dockItemText: {
    fontSize: 12,
    color: '#64748B',
  },
});
