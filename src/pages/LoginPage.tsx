import { useState } from 'react';
import { Building2, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface Props {
  onLogin: () => void;
}

const VALID_LOGIN = 'astreintes';
const VALID_PASSWORD = 'MdcAsPer08!';

export default function LoginPage({ onLogin }: Props) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (login === VALID_LOGIN && password === VALID_PASSWORD) {
      sessionStorage.setItem('museum_auth', 'true');
      onLogin();
    } else {
      setError('Identifiant ou mot de passe incorrect');
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-slate-600/10 rounded-full blur-3xl" />
      </div>

      <div
        className={`relative w-full max-w-sm ${shaking ? 'animate-shake' : ''}`}
      >
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-slate-900 px-8 py-8 text-center border-b border-slate-700">
            <div className="w-14 h-14 rounded-xl bg-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-600/30">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Musee Planning</h1>
            <p className="text-slate-400 text-sm mt-1">Astreintes & Permanences</p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Identifiant
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={login}
                  onChange={e => { setLogin(e.target.value); setError(''); }}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="Identifiant"
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  className="w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="Mot de passe"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-all shadow-sm shadow-blue-600/20"
            >
              Se connecter
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
