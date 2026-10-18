/**
 * Weather Service for GestãoPro / RS Piscinas
 * Integrates with Open-Meteo API (free, reliable, no API key needed)
 * Provides current conditions, 5-day forecasts, storm/rain alerts, and pool treatment tips
 */

export interface WeatherCondition {
  label: string;
  icon: 'sun' | 'cloud-sun' | 'cloud' | 'cloud-rain' | 'cloud-lightning' | 'cloud-fog';
  color: string;
}

export interface DayForecast {
  date: string;
  weekday: string;
  tempMax: number;
  tempMin: number;
  rainProbability: number;
  rainMm: number;
  condition: WeatherCondition;
  isStormOrHeavyRain: boolean;
}

export interface WeatherData {
  city: string;
  currentTemp: number;
  humidity: number;
  windSpeed: number;
  condition: WeatherCondition;
  daily: DayForecast[];
  hasStormAlert: boolean;
  stormAlertMessage?: string;
  poolAdvice: string;
  updatedAt: string;
}

const WMO_MAP: Record<number, WeatherCondition> = {
  0: { label: 'Céu Limpo', icon: 'sun', color: 'text-amber-500' },
  1: { label: 'Poucas Nuvens', icon: 'cloud-sun', color: 'text-amber-400' },
  2: { label: 'Parcialmente Nublado', icon: 'cloud-sun', color: 'text-sky-400' },
  3: { label: 'Encoberto', icon: 'cloud', color: 'text-slate-400' },
  45: { label: 'Nevoeiro', icon: 'cloud-fog', color: 'text-slate-400' },
  48: { label: 'Nevoeiro Denso', icon: 'cloud-fog', color: 'text-slate-400' },
  51: { label: 'Garoa Leve', icon: 'cloud-rain', color: 'text-blue-400' },
  53: { label: 'Garoa Moderada', icon: 'cloud-rain', color: 'text-blue-500' },
  55: { label: 'Garoa Densa', icon: 'cloud-rain', color: 'text-blue-600' },
  61: { label: 'Chuva Fraca', icon: 'cloud-rain', color: 'text-blue-500' },
  63: { label: 'Chuva Moderada', icon: 'cloud-rain', color: 'text-blue-600' },
  65: { label: 'Chuva Forte', icon: 'cloud-rain', color: 'text-blue-700' },
  80: { label: 'Pancadas de Chuva', icon: 'cloud-rain', color: 'text-indigo-500' },
  81: { label: 'Pancadas Moderadas', icon: 'cloud-rain', color: 'text-indigo-600' },
  82: { label: 'Pancadas Violentas', icon: 'cloud-rain', color: 'text-indigo-700' },
  95: { label: 'Tempestade com Trovoadas', icon: 'cloud-lightning', color: 'text-purple-600' },
  96: { label: 'Tempestade com Granizo Leve', icon: 'cloud-lightning', color: 'text-purple-700' },
  99: { label: 'Tempestade Severa com Granizo', icon: 'cloud-lightning', color: 'text-purple-800' },
};

function getCondition(code: number): WeatherCondition {
  return WMO_MAP[code] || { label: 'Nublado', icon: 'cloud', color: 'text-slate-500' };
}

function getWeekdayName(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return names[date.getDay()] || '';
  } catch {
    return '';
  }
}

// Campo Grande / MS latitude & longitude default
const DEFAULT_LAT = -20.4697;
const DEFAULT_LNG = -54.6201;
const CACHE_KEY = 'gestaopro_weather_cache';
const CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutes

export async function fetchWeatherData(lat: number = DEFAULT_LAT, lng: number = DEFAULT_LNG): Promise<WeatherData | null> {
  // Check local cache
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
        return parsed.data;
      }
    }
  } catch (e) {
    // Ignore cache error
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=America%2FCuiaba`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Weather fetch status ${res.status}`);

    const raw = await res.json();
    const currentCode = raw.current?.weather_code ?? 0;
    const currentCondition = getCondition(currentCode);

    const dailyDays: DayForecast[] = [];
    let hasStormAlert = false;
    let stormDaysText: string[] = [];

    const times = raw.daily?.time || [];
    for (let i = 0; i < Math.min(times.length, 5); i++) {
      const dDate = times[i];
      const code = raw.daily.weather_code[i] ?? 0;
      const prob = raw.daily.precipitation_probability_max[i] ?? 0;
      const mm = raw.daily.precipitation_sum[i] ?? 0;
      const cond = getCondition(code);
      const isStorm = [65, 81, 82, 95, 96, 99].includes(code) || (prob >= 65 && mm >= 5);

      if (isStorm && (i === 0 || i === 1)) {
        hasStormAlert = true;
        stormDaysText.push(i === 0 ? 'Hoje' : 'Amanhã');
      }

      dailyDays.push({
        date: dDate,
        weekday: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : getWeekdayName(dDate),
        tempMax: Math.round(raw.daily.temperature_2m_max[i] ?? 0),
        tempMin: Math.round(raw.daily.temperature_2m_min[i] ?? 0),
        rainProbability: Math.round(prob),
        rainMm: Math.round(mm * 10) / 10,
        condition: cond,
        isStormOrHeavyRain: isStorm,
      });
    }

    // Determine smart pool advice based on conditions
    let poolAdvice = 'Condições favoráveis para tratamento de rotina e aspiração.';
    let stormAlertMessage = '';

    if (hasStormAlert) {
      stormAlertMessage = `Alerta Meteorológico (${stormDaysText.join(' e ')}): Previsão de chuvas fortes / tempestades. Recomendada dosagem preventiva de algicida de manutenção e clarificante para evitar turbidez e água verde após enxurrada.`;
      poolAdvice = 'Atenção com chuvas fortes: proteja os skimmers contra transbordamento e aumente a cloração residual para suportar a carga de matéria orgânica trazida pela chuva.';
    } else if (raw.current?.temperature_2m >= 32) {
      poolAdvice = 'Calor intenso: A radiação UV decompõe o cloro livre rapidamente. Mantenha o residual de cloro acima de 2,5 ppm e cheque o ácido cianúrico (estabilizador).';
    } else if (dailyDays[0]?.rainProbability >= 40) {
      poolAdvice = 'Possibilidade de chuva isolada: Verifique se o nível da água não está alto demais e garanta que o residual de cloro esteja ajustado.';
    }

    const weatherData: WeatherData = {
      city: 'Campo Grande - MS',
      currentTemp: Math.round(raw.current?.temperature_2m ?? 26),
      humidity: Math.round(raw.current?.relative_humidity_2m ?? 60),
      windSpeed: Math.round(raw.current?.wind_speed_10m ?? 0),
      condition: currentCondition,
      daily: dailyDays,
      hasStormAlert,
      stormAlertMessage: hasStormAlert ? stormAlertMessage : undefined,
      poolAdvice,
      updatedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    // Save cache
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: weatherData }));
    } catch {}

    return weatherData;
  } catch (err) {
    console.warn('[weatherService] Falha ao carregar dados meteorológicos:', err);
    // Return cached fallback if available
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached).data;
    } catch {}
    return null;
  }
}
