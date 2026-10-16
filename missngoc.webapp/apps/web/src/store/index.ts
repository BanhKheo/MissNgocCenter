import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { hasAnyPermission, type PMS } from '@missngoc/core';
import { appReducer } from './appSlice';

export const store = configureStore({
  reducer: { app: appReducer },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

export const selectProfile = (s: RootState) => s.app.profile;
export const selectToken = (s: RootState) => s.app.accessToken;

/** Menu và nút hiện theo quyền trong Redux. Server vẫn kiểm quyền ở mọi API (FR-AUTH-05). */
export function useCan(...required: PMS[]): boolean {
  const profile = useAppSelector(selectProfile);
  return hasAnyPermission(profile?.permissions, required);
}

export * from './appSlice';
