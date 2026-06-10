export type RootStackParamList = {
  Home: undefined;
  Game: { gameId: string; asHost: boolean };
  Debug: { snapshot?: Record<string, unknown> } | undefined;
};
