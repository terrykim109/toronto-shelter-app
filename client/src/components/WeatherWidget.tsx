import { useEffect } from "react";

const SCRIPT_ID = "weatherwidget-io-js";

export function WeatherWidget() {
  useEffect(() => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.remove();
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://weatherwidget.io/js/widget.min.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return (
    <section className="weather-section" aria-labelledby="weather-heading">
      <div className="section-header">
        <h2 id="weather-heading">Toronto weather</h2>
        <p>Local conditions for planning your trip.</p>
      </div>
      <a
        className="weatherwidget-io"
        href="https://forecast7.com/en/43d65n79d38/toronto/"
        data-label_1="TORONTO"
        data-label_2="WEATHER"
        data-theme="gray"
      >
        TORONTO WEATHER
      </a>
    </section>
  );
}
