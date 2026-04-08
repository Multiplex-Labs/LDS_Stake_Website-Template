import { useState, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, MapPin, Navigation, Info, X, Maximize2 } from "lucide-react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import stakeBoundaryData from "@/data/stake-boundary.json";
import L from "leaflet";

// Fix for default marker icon in React-Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Component to handle map view updates
function MapUpdater({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export default function WardMap() {
  const [address, setAddress] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ward: string; message: string } | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(true);

  // Default view (Logan, UT)
  const [viewState, setViewState] = useState({
    center: [41.7370, -111.8338] as [number, number],
    zoom: 13
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;

    setLoading(true);

    // Simulate API delay
    setTimeout(() => {
      setLoading(false);
      setHasSearched(true);

      // Mock logic - simply for demonstration
      setResult({
        ward: "9th Ward",
        message: "You are within the 9th Ward boundaries."
      });

      // Zoom in to a location
      setViewState({
        center: [41.7370, -111.8338],
        zoom: 15
      });
    }, 1500);
  };

  const geoJsonStyle = {
    color: "#ff7f0e", // Orange/Gold color typical for boundaries
    weight: 3,
    opacity: 0.8,
    fill: false // No fill as requested
  };

  return (
    <div className="h-screen bg-background font-sans antialiased flex flex-col overflow-hidden">
      <Navbar />
      <div className="flex-1 relative overflow-hidden bg-slate-950">

        {/* Map Background - Always fully visible now */}
        <div className="absolute inset-0 z-0">
          <MapContainer
            center={viewState.center}
            zoom={viewState.zoom}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <GeoJSON data={stakeBoundaryData as any} style={geoJsonStyle} />
            <MapUpdater center={viewState.center} zoom={viewState.zoom} />
          </MapContainer>
        </div>

        {/* Re-open Search Button (Visible when modal is closed) */}
        {!showSearchModal && !hasSearched && (
          <div className="absolute top-4 left-4 z-[40]">
             <Button
                onClick={() => setShowSearchModal(true)}
                className="bg-slate-900/90 backdrop-blur text-white border border-slate-700 shadow-xl hover:bg-slate-800 gap-2"
              >
                <Search className="h-4 w-4" />
                Find Ward
              </Button>
          </div>
        )}

        {/* Search Result Overlay (Top-Left corner after search) */}
        {hasSearched && (
          <div className="absolute top-4 left-4 right-4 md:right-auto md:w-[400px] z-[1000] animate-in slide-in-from-top-4 duration-500">
             <Card className="border-slate-700 bg-slate-900/90 backdrop-blur-md shadow-2xl">
              <CardContent className="p-0">
                <div className="flex items-center px-4 py-3 border-b border-slate-800">
                    <Search className="h-5 w-5 text-slate-400 mr-3 shrink-0" />
                    <Input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)}
                      placeholder="Search address..."
                      className="border-0 bg-transparent text-white placeholder:text-slate-500 focus-visible:ring-0 text-base h-auto p-0 shadow-none"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-400 hover:text-white h-8 w-8 p-0 ml-2"
                      onClick={() => {
                        setHasSearched(false);
                        setAddress("");
                        setResult(null);
                        setShowSearchModal(true); // Go back to modal view
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                </div>
                {result && (
                  <div className="p-4 bg-slate-800/30">
                    <div className="flex items-start gap-3">
                      <div className="bg-primary/20 p-2 rounded-full mt-0.5">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-lg">{result.ward}</h3>
                        <p className="text-slate-400 text-sm mb-3">{result.message}</p>
                        <Button className="w-full text-xs h-8" variant="secondary">
                          View Meeting Times
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
             </Card>
          </div>
        )}

        {/* Initial Search Modal - Centered Popup */}
        {showSearchModal && !hasSearched && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-[2px] animate-in fade-in duration-300">
            <div className="w-full max-w-lg relative animate-in zoom-in-95 slide-in-from-bottom-4 duration-500">

              {/* Close Button for Modal */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute -top-12 right-0 text-white/70 hover:text-white hover:bg-white/10 rounded-full"
                onClick={() => setShowSearchModal(false)}
              >
                <X className="h-6 w-6" />
                <span className="sr-only">Close</span>
              </Button>

              <div className="text-center mb-8">
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight drop-shadow-lg font-serif">
                  Find your ward
                </h1>
                <p className="text-lg text-slate-200/90 max-w-md mx-auto drop-shadow-md font-medium">
                  Enter your address to find your designated ward and meeting times.
                </p>
              </div>

              <Card className="border-slate-700 bg-slate-900 shadow-2xl overflow-hidden rounded-xl border-2">
                <CardContent className="p-0">
                  <form onSubmit={handleSearch} className="relative">
                    <div className="flex items-center px-4 py-4">
                      <Search className="h-5 w-5 text-slate-400 mr-3 shrink-0" />
                      <Input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Search address or zip code"
                        className="border-0 bg-transparent text-white placeholder:text-slate-500 focus-visible:ring-0 text-base h-auto p-0 shadow-none"
                        autoFocus
                      />
                    </div>

                    {/* Progress Bar */}
                    {loading && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800">
                        <div className="h-full bg-primary animate-indeterminate" />
                      </div>
                    )}
                  </form>

                  {/* Initial State Helper Links */}
                  {!loading && (
                    <div className="border-t border-slate-800 bg-slate-900/50 p-2">
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-slate-400 hover:text-primary hover:bg-slate-800/50 h-auto py-2.5 px-3"
                        onClick={() => {
                          if (navigator.geolocation) {
                            setLoading(true);
                            navigator.geolocation.getCurrentPosition(() => {
                              setAddress("Current Location");
                              handleSearch({ preventDefault: () => {} } as any);
                            });
                          }
                        }}
                      >
                        <Navigation className="h-4 w-4 mr-3" />
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-medium">Use current location</span>
                        </div>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          </div>
        )}

        {/* Legend / Info Overlay */}
        <div className="absolute bottom-6 right-6 z-[400] bg-slate-900/90 backdrop-blur p-4 rounded-lg border border-slate-800 shadow-xl max-w-xs">
            <h4 className="text-white font-medium mb-2 flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Stake Boundary
            </h4>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <span className="block w-4 h-4 rounded-sm border-2 border-[#ff7f0e]"></span>
              LMS 2nd Stake
            </div>
        </div>
      </div>
      <div className="shrink-0 z-50 bg-background border-t">
        <Footer />
      </div>
    </div>
  );
}
