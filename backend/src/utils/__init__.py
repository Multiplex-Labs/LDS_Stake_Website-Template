from .security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user_session,
    CallingUser
)

from .db import (
    session_cleanup_loop,
    create_default_admin_user,
    create_system_callings_and_assignments,
    create_presidency_assignments,
    validate_unique_field,
    speaking_assignment_cleanup_loop,
    create_discord_bot_user,
    upsert_temple_recommend_config,
    upsert_site_settings,
    create_default_appointment_types,
    pre_populate_fast_sunday_exceptions,
    CURATED_ICONS,
)

from .email import (
    send_email,
    validate_email_credentials,
    render_booking_confirmation,
    render_interviewer_notification,
    render_member_cancellation_confirmation,
    render_presidency_cancellation_notice,
    render_booking_reschedule_success,
    render_reschedule_interviewer_notification,
    render_booking_reminder,
    render_booking_already_confirmed,
    EmailConfigError,
    ProviderError,
)

from .time import format_datetime_http

from .permissions import user_has_permission, build_permissions_response, get_user_effective_permissions

from .usercalling import get_or_make_user_calling, get_or_make_hc_assignment, user_has_calling, HC_CALLING_NAME, BISHOP_CALLING_NAME

from .speaking_assignments import (
    load_speaking_schedule,
    get_speaking_calendar,
    speaking_schedule
)

from .calling_kanban import (
    can_approve_proposal,
    is_high_councilor,
    is_stake_presidency,
    get_current_proposal_status,
    create_kanban_update,
    update_proposal_status,
    ensure_interview_row,
    get_stake_presidency,
    get_high_councilors,
    get_proposal_status,
    create_backup,
    create_backup_loop
)

from .ward import load_wards, get_bishops_ward

from .discord_bot import DiscordBotHandle

from .background import send_appointment_reminders_loop, process_reminders