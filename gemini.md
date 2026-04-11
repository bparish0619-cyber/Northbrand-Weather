# Weather Dashboard Implementation Instructions

Please build a live weather dashboard based on the following features and constraints.

## 1. General Functionality
- **Location Selection:** The application must allow the user to specify an area/location to retrieve local weather data.
- **Time Formatting:** All times displayed throughout the dashboard **must** be presented in 24-hour military time format (e.g., `1400`, `0930`).

## 2. Weather Information & Visuals
- **NWS Area Forecast Discussion:** Fetch and display the local National Weather Service (NWS) Area Forecast Discussion data to provide deep meteorological context.
- **Current Radar:** Embed and display a live, current weather radar image centered on the user-specified location.
- **5-Day Forecast:** Present a forecast for the next 5 days, showing expected daily conditions.
- **Aviation Weather:** Retrieve and display the current `METAR` (Routine Aviation Weather Report) and `TAF` (Terminal Aerodrome Forecast) data for the nearest airport/station.

## 3. Alerts and Threat Highlighting
- **Significant Risks:** Clearly highlight any significant weather risks, severe alerts, or threats present in the forecast.
- **Threat Timing:** When highlighting risks, clearly display the start and expiration times (in 24-hour format) if available.

## 4. Technical & API Suggestions
- **NWS API (`api.weather.gov`):** Can be used to obtain the 5-day point forecast, active alerts, and the text for the area forecast discussion.
- **Aviation Weather Center API:** Can be used to fetch METARs and TAFs by station identifier. 
- **Radar Imagery:** Consider leveraging standard NOAA/NWS radar tile services or embedded graphical displays.
