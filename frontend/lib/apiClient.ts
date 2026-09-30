import { authClient, SignUpParams, SignInParams } from './authClient';

export { authClient };

class QueryBuilder {
  private tableName: string;
  private filters: Array<{ column: string; value: any }> = [];
  private orderConfig?: { column: string; ascending?: boolean };
  private limitCount?: number;
  private isSingle = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(_fields?: string) {
    return this;
  }

  insert(_data: any) {
    return this;
  }

  upsert(_data: any) {
    return this;
  }

  update(_data: any) {
    return this;
  }

  delete() {
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderConfig = { column, ascending: options?.ascending };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  async then(resolve: (val: any) => void, _reject: (err: any) => void) {
    try {
      let endpoint = '';
      if (this.tableName === 'properties') {
        endpoint = '/api/properties';
      } else if (this.tableName === 'applications') {
        endpoint = '/api/applications';
      } else if (this.tableName === 'profiles') {
        endpoint = '/api/auth/me';
      } else {
        endpoint = `/api/${this.tableName}`;
      }

      const res = await fetch(endpoint, { credentials: 'include' });
      if (!res.ok) {
        resolve({ data: this.isSingle ? null : [], error: new Error('Request failed') });
        return;
      }
      const json = await res.json();
      let data = json.properties || json.applications || json.profile || json.data || json;

      if (Array.isArray(data)) {
        for (const f of this.filters) {
          data = data.filter((item: any) => item[f.column] === f.value);
        }
        if (this.isSingle) {
          data = data[0] || null;
        }
      }

      resolve({ data, error: null });
    } catch (err) {
      resolve({ data: this.isSingle ? null : [], error: err });
    }
  }
}

class EasyRentClient {
  storage = {
    from: (bucketName: string) => ({
      upload: async (path: string, _file: any, _options?: any) => ({
        data: { path: `${bucketName}/${path}` },
        error: null,
      }),
      getPublicUrl: (path: string) => ({
        data: {
          publicUrl: `https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=80#${encodeURIComponent(path)}`,
        },
      }),
    }),
  };

  auth = {
    async getUser() {
      try {
        const { user, profile } = await authClient.getUser();
        if (!user) return { data: { user: null }, error: null };
        return {
          data: {
            user: {
              id: user.id,
              email: user.email,
              user_metadata: {
                full_name: profile?.full_name || '',
                role: profile?.role || 'tenant',
              },
            },
          },
          error: null,
        };
      } catch (err: any) {
        return { data: { user: null }, error: err };
      }
    },

    async getSession() {
      const res = await this.getUser();
      const user = res.data?.user || null;
      if (!user) return { data: { session: null }, error: null };
      return {
        data: {
          session: {
            user,
            access_token: 'cookie-session',
          },
        },
        error: null,
      };
    },

    async signInWithPassword({ email, password }: SignInParams) {
      try {
        const result = await authClient.signIn({ email, password });
        return {
          data: {
            user: result.user,
            session: { access_token: result.token, user: result.user },
          },
          error: null,
        };
      } catch (err: any) {
        return { data: { user: null, session: null }, error: err };
      }
    },

    async signUp(options: {
      email: string;
      password: string;
      options?: { data?: { full_name?: string; role?: string; company?: string }; emailRedirectTo?: string };
    }) {
      try {
        const result = await authClient.signUp({
          email: options.email,
          password: options.password,
          fullName: options.options?.data?.full_name,
          role: options.options?.data?.role,
        });
        return {
          data: {
            user: result.user,
            session: { access_token: result.token, user: result.user },
          },
          error: null,
        };
      } catch (err: any) {
        return { data: { user: null, session: null }, error: err };
      }
    },

    async signOut() {
      try {
        await authClient.signOut();
        return { error: null };
      } catch (err: any) {
        return { error: err };
      }
    },

    onAuthStateChange(callback: (event: string, session: any) => void) {
      this.getSession().then(({ data }) => {
        callback(data?.session ? 'SIGNED_IN' : 'SIGNED_OUT', data?.session);
      });
      return {
        data: {
          subscription: {
            unsubscribe: () => {},
          },
        },
      };
    },
  };

  from(tableName: string) {
    return new QueryBuilder(tableName);
  }
}

export const db = new EasyRentClient();
