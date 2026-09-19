import { useState, type ReactNode } from "react";
import { CloudSun, Flower2, Leaf, Loader2, MapPin, Sun, Wind } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudioVehicle } from "@/components/mapstudio/types";
import {
  gmapsInvoke,
  type AirQualityResponse,
  type LatLng,
  type PollenResponse,
  type SolarResponse,
  type WeatherCurrent,
  type WeatherForecast,
} from "@/lib/google-maps";

interface EnvironmentPanelProps {
  mapView: { lat: number; lng: number; zoom: number } | null;
  lastMapClick: { lat: number; lng: number } | null;
  vehicles: StudioVehicle[];
  selectedDeviceId: string | null;
}

type PointSource = "vehicle" | "click" | "center";

function RawJson({ data }: { data: unknown }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[11px] font-medium text-primary">Raw API response</summary>
      <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-card/60 p-2 text-[10px] leading-relaxed text-muted-foreground">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

function EnvCard({
  icon,
  title,
  api,
  children,
  onLoad,
  busy,
  error,
  loaded,
}: {
  icon: ReactNode;
  title: string;
  api: string;
  children: ReactNode;
  onLoad: () => void;
  busy: boolean;
  error: string | null;
  loaded: boolean;
}) {
  return (
    <Card className="border-border bg-card/60">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {icon} {title}
          <span className="text-[10px] font-normal text-muted-foreground">{api}</span>
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onLoad} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Load
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && !loaded && !busy && (
          <p className="py-6 text-center text-xs text-muted-foreground">Press load to query this API for the selected point.</p>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

export function EnvironmentPanel({ mapView, lastMapClick, vehicles, selectedDeviceId }: EnvironmentPanelProps) {
  const [source, setSource] = useState<PointSource>("center");
  const [overridePoint, setOverridePoint] = useState<LatLng | null>(null);

  const [weather, setWeather] = useState<WeatherCurrent | null>(null);
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const [air, setAir] = useState<AirQualityResponse | null>(null);
  const [airBusy, setAirBusy] = useState(false);
  const [airError, setAirError] = useState<string | null>(null);

  const [pollen, setPollen] = useState<PollenResponse | null>(null);
  const [pollenBusy, setPollenBusy] = useState(false);
  const [pollenError, setPollenError] = useState<string | null>(null);

  const [solar, setSolar] = useState<SolarResponse | null>(null);
  const [solarBusy, setSolarBusy] = useState(false);
  const [solarError, setSolarError] = useState<string | null>(null);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.deviceId === selectedDeviceId) ?? null;
  const vehiclePoint: LatLng | null =
    selectedVehicle?.position &&
    Number.isFinite(selectedVehicle.position.latitude) &&
    Number.isFinite(selectedVehicle.position.longitude) &&
    !(selectedVehicle.position.latitude === 0 && selectedVehicle.position.longitude === 0)
      ? { latitude: selectedVehicle.position.latitude, longitude: selectedVehicle.position.longitude }
      : null;

  const point: LatLng | null =
    overridePoint ??
    (source === "vehicle"
      ? vehiclePoint
      : source === "click"
        ? lastMapClick
          ? { latitude: lastMapClick.lat, longitude: lastMapClick.lng }
          : null
        : mapView
          ? { latitude: mapView.lat, longitude: mapView.lng }
          : null);

  const setManualSource = (next: PointSource) => {
    setOverridePoint(null);
    setSource(next);
  };

  const loadWeather = async () => {
    if (!point) return;
    setWeatherBusy(true);
    setWeatherError(null);
    try {
      const [current, daily] = await Promise.all([
        gmapsInvoke<WeatherCurrent>("weather-current", { location: point }),
        gmapsInvoke<WeatherForecast>("weather-forecast", { location: point, days: 5 }),
      ]);
      setWeather(current);
      setForecast(daily);
    } catch (caught) {
      setWeatherError(caught instanceof Error ? caught.message : "Weather lookup failed");
    } finally {
      setWeatherBusy(false);
    }
  };

  const loadAir = async () => {
    if (!point) return;
    setAirBusy(true);
    setAirError(null);
    try {
      setAir(await gmapsInvoke<AirQualityResponse>("air-quality", { location: point }));
    } catch (caught) {
      setAirError(caught instanceof Error ? caught.message : "Air quality lookup failed");
    } finally {
      setAirBusy(false);
    }
  };

  const loadPollen = async () => {
    if (!point) return;
    setPollenBusy(true);
    setPollenError(null);
    try {
      setPollen(await gmapsInvoke<PollenResponse>("pollen", { location: point, days: 4 }));
    } catch (caught) {
      setPollenError(caught instanceof Error ? caught.message : "Pollen lookup failed");
    } finally {
      setPollenBusy(false);
    }
  };

  const loadSolar = async () => {
    if (!point) return;
    setSolarBusy(true);
    setSolarError(null);
    try {
      setSolar(await gmapsInvoke<SolarResponse>("solar", { location: point }));
    } catch (caught) {
      setSolarError(caught instanceof Error ? caught.message : "Solar lookup failed (coverage is limited to supported regions)");
    } finally {
      setSolarBusy(false);
    }
  };

  const aqiCategory = air ? (typeof air.category === "string" ? air.category : air.category?.text) ?? "—" : "—";
  const aqiPollenTone = (aqi: number) =>
    aqi <= 50
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
      : aqi <= 100
        ? "border-amber-500/25 bg-amber-500/10 text-amber-400"
        : aqi <= 150
          ? "border-orange-500/25 bg-orange-500/10 text-orange-400"
          : "border-rose-500/25 bg-rose-500/10 text-rose-400";
  const dominantPollutant = air ? (typeof air.dominantPollutant === "string" ? air.dominantPollutant : air.dominantPollutant?.displayName) ?? "—" : "—";
  const humidity = weather ? (typeof weather.humidity === "number" ? weather.humidity : (weather.humidity as { relative?: number } | undefined)?.relative) : undefined;
  const bestConfig = solar?.solarPotential?.solarPanelConfigs?.reduce<{ panelsCount?: number; yearlyEnergyDcKwh?: number }>(
    (best, config) => ((config.yearlyEnergyDcKwh ?? 0) > (best.yearlyEnergyDcKwh ?? 0) ? config : best),
    {},
  );

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Location for data lookups</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={source === "center" ? "default" : "outline"} onClick={() => setManualSource("center")}>
            Map center
          </Button>
          <Button size="sm" variant={source === "click" ? "default" : "outline"} onClick={() => setManualSource("click")} disabled={!lastMapClick}>
            Map click
          </Button>
          <Button size="sm" variant={source === "vehicle" ? "default" : "outline"} onClick={() => setManualSource("vehicle")} disabled={!vehiclePoint}>
            Selected vehicle
          </Button>
          {lastMapClick && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOverridePoint({ latitude: lastMapClick.lat, longitude: lastMapClick.lng });
              }}
            >
              Pin last click
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-1.5 font-mono text-xs">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            {point ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` : "No point selected"}
            {overridePoint && <Badge variant="outline" className="text-[10px]">pinned</Badge>}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <EnvCard
          icon={<CloudSun className="h-4 w-4 text-sky-400" />}
          title="Weather"
          api="Weather API"
          onLoad={() => void loadWeather()}
          busy={weatherBusy}
          error={weatherError}
          loaded={Boolean(weather)}
        >
          {weather && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 rounded-xl border border-border bg-background/40 p-4">
                <div className="text-4xl font-bold text-sky-400">{weather.temperature?.degrees != null ? `${Math.round(weather.temperature.degrees)}°` : "—"}</div>
                <div className="space-y-0.5 text-xs">
                  <div className="text-sm font-semibold">{weather.weatherCondition?.description?.text ?? "Current conditions"}</div>
                  <div className="text-muted-foreground">
                    Humidity {humidity != null ? `${Math.round(humidity)}%` : "—"} · UV {weather.uvIndex ?? "—"} · Cloud {weather.cloudCover ?? "—"}%
                  </div>
                  <div className="text-muted-foreground">
                    Wind {weather.wind?.speed?.value != null ? `${Math.round(weather.wind.speed.value)} km/h` : "—"}
                    {weather.wind?.direction?.cardinal ? ` ${weather.wind.direction.cardinal}` : ""}
                  </div>
                </div>
              </div>

              {forecast?.forecastDays && forecast.forecastDays.length > 0 && (
                <div className="grid grid-cols-5 gap-1.5">
                  {forecast.forecastDays.slice(0, 5).map((day, index) => (
                    <div key={index} className="rounded-lg border border-border bg-background/40 p-2 text-center">
                      <div className="text-[10px] text-muted-foreground">
                        {day.interval?.startTime ? new Date(day.interval.startTime).toLocaleDateString("en", { weekday: "short" }) : `Day ${index + 1}`}
                      </div>
                      <div className="mt-1 text-xs font-semibold">
                        {day.daytimeMaxTemperature?.degrees != null ? `${Math.round(day.daytimeMaxTemperature.degrees)}°` : "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {day.nighttimeMinTemperature?.degrees != null ? `${Math.round(day.nighttimeMinTemperature.degrees)}°` : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <RawJson data={weather} />
            </div>
          )}
        </EnvCard>

        <EnvCard
          icon={<Wind className="h-4 w-4 text-teal-400" />}
          title="Air quality"
          api="Air Quality API"
          onLoad={() => void loadAir()}
          busy={airBusy}
          error={airError}
          loaded={Boolean(air)}
        >
          {air && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 rounded-xl border border-border bg-background/40 p-4">
                <div className={`flex h-16 w-16 flex-col items-center justify-center rounded-2xl border ${air.aqi != null ? aqiPollenTone(air.aqi) : "border-border"}`}>
                  <span className="text-2xl font-bold">{air.aqi ?? "—"}</span>
                  <span className="text-[9px] uppercase tracking-wide opacity-80">AQI</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="text-sm font-semibold">{aqiCategory}</div>
                  <div className="text-muted-foreground">Dominant pollutant</div>
                  <div className="font-medium">{dominantPollutant}</div>
                </div>
              </div>
              <RawJson data={air} />
            </div>
          )}
        </EnvCard>

        <EnvCard
          icon={<Flower2 className="h-4 w-4 text-lime-400" />}
          title="Pollen"
          api="Pollen API"
          onLoad={() => void loadPollen()}
          busy={pollenBusy}
          error={pollenError}
          loaded={Boolean(pollen)}
        >
          {pollen && (
            <div className="space-y-2">
              {(pollen.dailyInfo ?? []).slice(0, 4).map((day, dayIndex) => (
                <div key={dayIndex} className="rounded-xl border border-border bg-background/40 p-3">
                  <div className="text-xs font-semibold">
                    {day.date ? `${day.date.year}-${String(day.date.month).padStart(2, "0")}-${String(day.date.day).padStart(2, "0")}` : `Day ${dayIndex + 1}`}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(day.pollenTypeInfo ?? []).map((info, infoIndex) => (
                      <Badge
                        key={infoIndex}
                        variant="outline"
                        className={`text-[11px] ${info.indexInfo?.value != null ? aqiPollenTone(info.indexInfo.value * 20) : ""}`}
                      >
                        <Leaf className="mr-1 h-3 w-3" />
                        {info.code ?? "?"}: {info.indexInfo?.value ?? "—"} {info.indexInfo?.category ? `(${info.indexInfo.category})` : ""}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
              {(pollen.dailyInfo ?? []).length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">No pollen data for this location (coverage is limited).</p>
              )}
              <RawJson data={pollen} />
            </div>
          )}
        </EnvCard>

        <EnvCard
          icon={<Sun className="h-4 w-4 text-amber-400" />}
          title="Solar potential"
          api="Solar API"
          onLoad={() => void loadSolar()}
          busy={solarBusy}
          error={solarError}
          loaded={Boolean(solar)}
        >
          {solar && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-background/40 p-3 text-xs">
                <div className="font-semibold">{solar.address ?? "Nearest building"}</div>
                {solar.imageryDate && (
                  <div className="mt-0.5 text-muted-foreground">
                    Imagery {solar.imageryDate.year}-{String(solar.imageryDate.month).padStart(2, "0")} · {solar.imageryQuality ?? "—"} quality
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border bg-background/40 p-2.5">
                  <div className="text-[11px] text-muted-foreground">Max panels</div>
                  <div className="text-lg font-bold">{solar.solarPotential?.maxArrayPanelsCount ?? "—"}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-2.5">
                  <div className="text-[11px] text-muted-foreground">Sun hours / year</div>
                  <div className="text-lg font-bold">{solar.solarPotential?.maxSunshineHoursPerYear ?? "—"}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-2.5">
                  <div className="text-[11px] text-muted-foreground">Roof segments</div>
                  <div className="text-lg font-bold">{solar.solarPotential?.roofSegmentStats?.length ?? "—"}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-2.5">
                  <div className="text-[11px] text-muted-foreground">Best config yield</div>
                  <div className="text-lg font-bold">
                    {bestConfig?.yearlyEnergyDcKwh != null ? `${Math.round(bestConfig.yearlyEnergyDcKwh).toLocaleString()} kWh` : "—"}
                  </div>
                </div>
              </div>
              <RawJson data={solar} />
            </div>
          )}
        </EnvCard>
      </div>
    </div>
  );
}
