export type RootStackParamList = {
  Home: undefined;
  Game: { gameId: string; asHost: boolean };
  Paywall: { reason?: 'trial' | 'monthly' } | undefined;
  Debug: { snapshot?: Record<string, unknown> } | undefined;
};
