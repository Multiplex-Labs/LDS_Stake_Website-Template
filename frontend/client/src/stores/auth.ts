import { create } from "zustand";

export interface Calling {
  id: number;
  name: string;
  max_slots: number;
  is_public: boolean;
  system_defined: boolean;
}

export interface UserCalling {
  id: number;
  user_id: number;
  calling_id: number;
  slot_number: number;
  calling: Calling;
}

export interface AuthUser {
  id: number;
  email: string;
  force_password_reset: boolean;
  fname: string;
  lname: string;
  active: boolean;
  phone: string | null;
  bio: string | null;
  profile_image: string | null;
  callings: UserCalling[] | null;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
}));
