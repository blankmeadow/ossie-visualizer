/**
 * 个人英语词库 -- MVP.
 *
 * Three tabs (今天 / 词库 / 我的) and a modal stack. Section 32: the app opens
 * straight into the product, with no sign-up wall; an anonymous child id is
 * created on first launch and the account can be attached later, once there is
 * something worth keeping.
 */
import React, { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ensureChild } from './src/api/client';
import { TabBar } from './src/components/TabBar';
import { EmptyState, Loading } from './src/components/ui';
import { NavProvider, useNav } from './src/nav/router';
import { AddSheet } from './src/screens/AddSheet';
import { AnalyzingScreen } from './src/screens/AnalyzingScreen';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { CompleteScreen } from './src/screens/CompleteScreen';
import { ConfirmScreen } from './src/screens/ConfirmScreen';
import { DetailScreen } from './src/screens/DetailScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { ManualAddScreen } from './src/screens/ManualAddScreen';
import { PaywallScreen } from './src/screens/PaywallScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { StudyScreen } from './src/screens/study/StudyScreen';
import { colors } from './src/theme';

/** Routes that take over the whole screen, hiding the tab bar. */
const FULLSCREEN = new Set(['capture', 'analyzing', 'confirm', 'manualAdd', 'study', 'complete', 'detail']);

function Shell() {
  const { tab, stack } = useNav();
  const top = stack[stack.length - 1];
  const fullscreen = top ? FULLSCREEN.has(top.name) : false;

  return (
    <View style={styles.root}>
      {!fullscreen ? (
        <>
          <View style={styles.tabContent}>
            {tab === 'today' ? <TodayScreen /> : null}
            {tab === 'library' ? <LibraryScreen /> : null}
            {tab === 'profile' ? <ProfileScreen /> : null}
          </View>
          <TabBar />
        </>
      ) : null}

      {stack.map((route, index) => (
        <View
          key={`${route.name}-${index}`}
          style={FULLSCREEN.has(route.name) ? styles.fullscreen : styles.modal}
          pointerEvents="box-none"
        >
          <RouteView name={route.name} params={route.params} />
        </View>
      ))}
    </View>
  );
}

function RouteView({ name, params }: { name: string; params?: Record<string, any> }) {
  switch (name) {
    case 'addSheet':
      return <AddSheet />;
    case 'capture':
      return <CaptureScreen mode={params?.mode ?? 'camera'} />;
    case 'analyzing':
      return <AnalyzingScreen sourceId={params!.sourceId} />;
    case 'confirm':
      return <ConfirmScreen sourceId={params!.sourceId} analysis={params!.analysis} />;
    case 'manualAdd':
      return <ManualAddScreen />;
    case 'study':
      return <StudyScreen />;
    case 'complete':
      return <CompleteScreen summary={params!.summary} />;
    case 'detail':
      return <DetailScreen id={params!.id} />;
    case 'paywall':
      return <PaywallScreen paywall={params!.paywall} />;
    default:
      return null;
  }
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureChild()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : '启动失败'));
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {error ? (
        <EmptyState
          emoji="🔌"
          title="连接不上服务"
          body={`${error}\n\n请先启动后端：\ncd backend && ./run.sh`}
        />
      ) : !ready ? (
        <Loading />
      ) : (
        <NavProvider>
          <Shell />
        </NavProvider>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1 },
  tabContent: { flex: 1 },
  fullscreen: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg },
  modal: { ...StyleSheet.absoluteFillObject },
});
