export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'tenant' | 'landlord' | 'handyman' | 'admin';
  phone?: string | null;
  is_verified?: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string | null;
    role?: string;
  };
  role?: string;
}

export interface SignUpParams {
  email: string;
  password: string;
  fullName?: string;
  name?: string;
  role?: string;
  phone?: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export const authClient = {
  async signUp(params: SignUpParams) {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    return data;
  },

  async signIn(params: SignInParams) {
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid credentials');
    }
    return data;
  },

  async signOut() {
    const res = await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' });
    if (!res.ok) {
      throw new Error('Sign out failed');
    }
    return res.json();
  },

  async getUser(): Promise<{ user: AuthUser | null; profile: UserProfile | null }> {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) {
        return { user: null, profile: null };
      }
      const data = await res.json();
      return { user: data.user || null, profile: data.profile || null };
    } catch {
      return { user: null, profile: null };
    }
  },
};
