from datetime import date, datetime, time as dtime

from icalendar import Calendar, Event


def generate_ics(
    event_name: str,
    event_date: date,
    start_time: str,
    end_time: str,
    organizer_email: str,
) -> bytes:
    """Generate RFC 5545 iCalendar bytes for a building reservation event.

    start_time and end_time are 24h strings like "14:00".
    """
    start_h, start_m = (int(x) for x in start_time.split(":"))
    end_h, end_m = (int(x) for x in end_time.split(":"))

    dtstart = datetime.combine(event_date, dtime(start_h, start_m))
    dtend = datetime.combine(event_date, dtime(end_h, end_m))

    cal = Calendar()
    cal.add("prodid", "-//LDS Stake//Building Reservation//EN")
    cal.add("version", "2.0")

    evt = Event()
    evt.add("summary", event_name)
    evt.add("dtstart", dtstart)
    evt.add("dtend", dtend)
    evt.add("organizer", f"mailto:{organizer_email}")

    cal.add_component(evt)
    return cal.to_ical()
