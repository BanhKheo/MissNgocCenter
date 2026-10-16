import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { getAccessToken, setAccessToken } from '../auth/tokenStore';

export interface AuthProfile {
  id: string;
  username: string;
  fullName: string;
  role: string;
  permissions: string[];
  mustChangePassword: boolean;
}

export interface AppState {
  accessToken: string | null;
  profile: AuthProfile | null;
  /** Đã kiểm tra token khi mở app chưa (AuthRehydrator) */
  isInitialized: boolean;
}

const initialState: AppState = {
  accessToken: getAccessToken(),
  profile: null,
  isInitialized: false,
};

// Phiên đăng nhập lưu trong Redux, giống slice `app` của IUROADMAP (FR-AUTH-02)
const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    loggedIn(state, action: PayloadAction<{ accessToken: string; profile: AuthProfile }>) {
      state.accessToken = action.payload.accessToken;
      state.profile = action.payload.profile;
      state.isInitialized = true;
      setAccessToken(action.payload.accessToken);
    },
    profileLoaded(state, action: PayloadAction<AuthProfile>) {
      state.profile = action.payload;
    },
    initialized(state) {
      state.isInitialized = true;
    },
    loggedOut(state) {
      state.accessToken = null;
      state.profile = null;
      state.isInitialized = true;
      setAccessToken(null);
    },
  },
});

export const { loggedIn, profileLoaded, initialized, loggedOut } = appSlice.actions;
export const appReducer = appSlice.reducer;
