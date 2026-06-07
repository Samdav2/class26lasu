import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../lib/api-client';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    const handleAuth = async () => {
      if (token) {
        localStorage.setItem('auth_token', token);

        try {
          const user = await authService.getProfile();

          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              { type: 'OAUTH_AUTH_SUCCESS', token, user },
              window.location.origin
            );
            window.close();
            return;
          }
        } catch (err) {
          console.error('Failed to fetch profile after OAuth callback', err);
        }

        await checkAuth();
        navigate('/admin');
      } else {
        console.error('No token found in callback URL');
        navigate('/');
      }
    };
    
    handleAuth();
  }, [token, checkAuth, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505]">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37] mb-4"></div>
        <p className="text-gray-400 font-sans tracking-widest uppercase text-sm">Authenticating Session...</p>
      </div>
    </div>
  );
}
