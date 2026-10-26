import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * The church's spot on a map: a pin to drag to the door, and the circle
 * a phone has to be inside to clock in.
 *
 * OpenStreetMap's own tiles, credited as its terms ask. The pin is drawn,
 * not an image, so nothing goes missing when the app is bundled. The map
 * is shown only to an Owner or Admin setting the spot, which keeps the
 * tiles asked for to a handful.
 */
export function PlaceMap({
  lat,
  lng,
  radius,
  editable,
  onMove,
  className = '',
}: {
  lat: number
  lng: number
  radius: number
  editable: boolean
  onMove: (to: { lat: number; lng: number }) => void
  className?: string
}) {
  const holder = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const pin = useRef<L.Marker | null>(null)
  const ring = useRef<L.Circle | null>(null)
  // The latest handler, without remaking the map when it changes.
  const moved = useRef(onMove)
  moved.current = onMove

  useEffect(() => {
    if (!holder.current || map.current) return
    const m = L.map(holder.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], 17)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m)
    const icon = L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--color-primary);box-shadow:0 0 0 3px white,0 2px 6px rgba(0,0,0,.35)"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 22],
    })
    const marker = L.marker([lat, lng], { draggable: editable, icon, keyboard: editable, title: 'Church' }).addTo(m)
    marker.on('dragend', () => {
      const at = marker.getLatLng()
      moved.current({ lat: at.lat, lng: at.lng })
    })
    // An SVG attribute does not read CSS variables, so the colour is read once here.
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#0a66d8'
    const circle = L.circle([lat, lng], {
      radius,
      color: primary,
      weight: 2,
      fillOpacity: 0.12,
    }).addTo(m)
    // The whole circle in view, with a little of what is around it.
    m.fitBounds(circle.getBounds(), { padding: [24, 24], maxZoom: 18 })
    if (editable) {
      m.on('click', (e: L.LeafletMouseEvent) => moved.current({ lat: e.latlng.lat, lng: e.latlng.lng }))
    }
    map.current = m
    pin.current = marker
    ring.current = circle
    return () => {
      m.remove()
      map.current = null
    }
    // The map is made once; the effects below follow the props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    pin.current?.setLatLng([lat, lng])
    ring.current?.setLatLng([lat, lng])
    if (map.current && !map.current.getBounds().contains([lat, lng])) map.current.panTo([lat, lng])
  }, [lat, lng])

  useEffect(() => {
    ring.current?.setRadius(radius)
    if (map.current && ring.current) map.current.fitBounds(ring.current.getBounds(), { padding: [24, 24], maxZoom: 18 })
  }, [radius])

  return (
    <div
      ref={holder}
      role="application"
      aria-label={editable ? 'Map: drag the pin, or tap the map, to the church’s door' : 'Map of the church'}
      className={`relative z-0 overflow-hidden rounded-[var(--radius-card)] hairline ${className}`}
    />
  )
}
