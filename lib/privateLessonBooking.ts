import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PrivateLessonFocus =
  | "Follow Focused"
  | "Lead Focused"
  | "Lead/Follow Focused";

export type CreatePrivateLessonBookingInput = {
  slotId: string;
  instructorId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  lessonFocus: PrivateLessonFocus;
  userId?: string | null;
};

export type PrivateLessonBookingErrorCode =
  | "SLOT_NOT_FOUND"
  | "SLOT_ALREADY_BOOKED"
  | "SLOT_IN_PAST"
  | "INSTRUCTOR_MISMATCH"
  | "BOOKING_NOT_FOUND"
  | "FORBIDDEN"
  | "LESSON_STARTED"
  | "INSERT_FAILED"
  | "DELETE_FAILED"
  | "SLOT_UPDATE_FAILED";

export class PrivateLessonBookingError extends Error {
  constructor(
    message: string,
    public readonly code: PrivateLessonBookingErrorCode,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "PrivateLessonBookingError";
  }
}

type LessonSlotRow = {
  id: string;
  instructor_id: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  duration_minutes?: number | null;
  price?: number | null;
  time_zone?: string | null;
  location?: string | null;
};

type LessonBookingRow = {
  id: string;
  slot_id: string;
  instructor_id: string;
  user_id?: string | null;
  student_name: string;
  student_email: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  lesson_focus?: string | null;
  cancel_token?: string | null;
};

export type CreatePrivateLessonBookingResult = {
  bookingId: string;
  cancelToken: string;
  slot: {
    id: string;
    start: string;
    end: string;
    instructorId: string;
    durationMinutes: number | null;
    price: number | null;
    timeZone: string | null;
    location: string | null;
  };
  studentName: string;
  studentEmail: string;
};

export type CancelPrivateLessonBookingResult = {
  slotId: string;
  instructorId: string;
  lessonStart: string;
  lessonEnd: string;
  timeZone: string | null;
  studentName: string;
  studentEmail: string | null;
};

function slotStartIso(slot: LessonSlotRow): string {
  return slot.start_time;
}

function isSlotInPast(slot: LessonSlotRow, now = new Date()): boolean {
  return new Date(slotStartIso(slot)).getTime() < now.getTime();
}

export async function createPrivateLessonBooking(
  supabase: SupabaseClient,
  input: CreatePrivateLessonBookingInput
): Promise<CreatePrivateLessonBookingResult> {
  const { data: slot, error: slotError } = await supabase
    .from("lesson_slots")
    .select(
      "id,instructor_id,start_time,end_time,is_booked,duration_minutes,price,time_zone,location"
    )
    .eq("id", input.slotId)
    .maybeSingle();

  if (slotError || !slot) {
    throw new PrivateLessonBookingError("Lesson slot not found.", "SLOT_NOT_FOUND", 404);
  }

  const row = slot as LessonSlotRow;

  if (row.instructor_id !== input.instructorId) {
    throw new PrivateLessonBookingError(
      "Instructor does not match this slot.",
      "INSTRUCTOR_MISMATCH",
      400
    );
  }

  if (row.is_booked) {
    throw new PrivateLessonBookingError(
      "This time slot is already booked.",
      "SLOT_ALREADY_BOOKED",
      409
    );
  }

  if (isSlotInPast(row)) {
    throw new PrivateLessonBookingError(
      "Cannot book a lesson that has already started.",
      "SLOT_IN_PAST",
      400
    );
  }

  const studentName = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();
  const studentEmail = input.email.trim();
  const cancelToken = randomUUID();

  const insertPayload: Record<string, unknown> = {
    slot_id: input.slotId,
    instructor_id: input.instructorId,
    student_name: studentName,
    student_email: studentEmail,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email: studentEmail,
    phone_number: input.phoneNumber.trim(),
    lesson_focus: input.lessonFocus,
    cancel_token: cancelToken,
  };

  if (input.userId) {
    insertPayload.user_id = input.userId;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("lesson_bookings")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    throw new PrivateLessonBookingError(
      insertError?.message || "Failed to create booking.",
      "INSERT_FAILED",
      500
    );
  }

  const { error: slotUpdateError } = await supabase
    .from("lesson_slots")
    .update({ is_booked: true })
    .eq("id", input.slotId)
    .eq("is_booked", false);

  if (slotUpdateError) {
    await supabase.from("lesson_bookings").delete().eq("id", inserted.id);
    throw new PrivateLessonBookingError(
      "Failed to reserve the time slot.",
      "SLOT_UPDATE_FAILED",
      500
    );
  }

  const { data: slotAfter } = await supabase
    .from("lesson_slots")
    .select("is_booked")
    .eq("id", input.slotId)
    .maybeSingle();

  if (!slotAfter?.is_booked) {
    await supabase.from("lesson_bookings").delete().eq("id", inserted.id);
    throw new PrivateLessonBookingError(
      "This time slot was just booked by someone else.",
      "SLOT_ALREADY_BOOKED",
      409
    );
  }

  return {
    bookingId: inserted.id as string,
    cancelToken,
    slot: {
      id: row.id,
      start: row.start_time,
      end: row.end_time,
      instructorId: row.instructor_id,
      durationMinutes: row.duration_minutes ?? null,
      price: row.price ?? null,
      timeZone: row.time_zone ?? null,
      location: row.location ?? null,
    },
    studentName,
    studentEmail,
  };
}

async function loadBookingForCancel(
  supabase: SupabaseClient,
  opts: { cancelToken?: string; bookingId?: string; userId?: string }
): Promise<{ booking: LessonBookingRow; slot: LessonSlotRow }> {
  let booking: LessonBookingRow | null = null;

  if (opts.cancelToken?.trim()) {
    const { data, error } = await supabase
      .from("lesson_bookings")
      .select(
        "id,slot_id,instructor_id,user_id,student_name,student_email,first_name,last_name,email,cancel_token"
      )
      .eq("cancel_token", opts.cancelToken.trim())
      .maybeSingle();
    if (error || !data) {
      throw new PrivateLessonBookingError(
        "Booking not found or already canceled.",
        "BOOKING_NOT_FOUND",
        404
      );
    }
    booking = data as LessonBookingRow;
  } else if (opts.bookingId && opts.userId) {
    const { data, error } = await supabase
      .from("lesson_bookings")
      .select(
        "id,slot_id,instructor_id,user_id,student_name,student_email,first_name,last_name,email,cancel_token"
      )
      .eq("id", opts.bookingId)
      .maybeSingle();
    if (error || !data) {
      throw new PrivateLessonBookingError(
        "Booking not found or already canceled.",
        "BOOKING_NOT_FOUND",
        404
      );
    }
    booking = data as LessonBookingRow;
    if (booking.user_id !== opts.userId) {
      throw new PrivateLessonBookingError(
        "You can only cancel your own booking.",
        "FORBIDDEN",
        403
      );
    }
  } else {
    throw new PrivateLessonBookingError(
      "Missing cancel token or signed-in booking.",
      "FORBIDDEN",
      403
    );
  }

  const { data: slot, error: slotError } = await supabase
    .from("lesson_slots")
    .select(
      "id,instructor_id,start_time,end_time,is_booked,duration_minutes,price,time_zone,location"
    )
    .eq("id", booking.slot_id)
    .maybeSingle();

  if (slotError || !slot) {
    throw new PrivateLessonBookingError("Lesson slot not found.", "SLOT_NOT_FOUND", 404);
  }

  return { booking, slot: slot as LessonSlotRow };
}

export async function cancelPrivateLessonBooking(
  supabase: SupabaseClient,
  opts: { cancelToken?: string; bookingId?: string; userId?: string }
): Promise<CancelPrivateLessonBookingResult> {
  const { booking, slot } = await loadBookingForCancel(supabase, opts);

  if (isSlotInPast(slot)) {
    throw new PrivateLessonBookingError(
      "Cannot cancel a lesson that has already started.",
      "LESSON_STARTED",
      400
    );
  }

  const { error: deleteError } = await supabase
    .from("lesson_bookings")
    .delete()
    .eq("id", booking.id);

  if (deleteError) {
    throw new PrivateLessonBookingError(
      deleteError.message || "Failed to cancel booking.",
      "DELETE_FAILED",
      500
    );
  }

  const { error: slotError } = await supabase
    .from("lesson_slots")
    .update({ is_booked: false })
    .eq("id", slot.id);

  if (slotError) {
    throw new PrivateLessonBookingError(
      slotError.message || "Failed to free the time slot.",
      "SLOT_UPDATE_FAILED",
      500
    );
  }

  const studentName =
    booking.first_name && booking.last_name
      ? `${booking.first_name} ${booking.last_name}`.trim()
      : booking.student_name;

  return {
    slotId: slot.id,
    instructorId: booking.instructor_id,
    lessonStart: slot.start_time,
    lessonEnd: slot.end_time,
    timeZone: slot.time_zone ?? null,
    studentName,
    studentEmail: booking.email || booking.student_email || null,
  };
}

export type PrivateLessonCancelLookup = {
  instructorName: string;
  lessonStart: string;
  lessonEnd: string;
  timeZone: string | null;
  price: number | null;
  location: string | null;
};

export async function lookupPrivateLessonBookingByCancelToken(
  supabase: SupabaseClient,
  cancelToken: string
): Promise<PrivateLessonCancelLookup> {
  const token = cancelToken.trim();
  if (!token) {
    throw new PrivateLessonBookingError(
      "Invalid cancel link.",
      "BOOKING_NOT_FOUND",
      404
    );
  }

  const { data: booking, error } = await supabase
    .from("lesson_bookings")
    .select("id,slot_id,instructor_id")
    .eq("cancel_token", token)
    .maybeSingle();

  if (error || !booking) {
    throw new PrivateLessonBookingError(
      "Booking not found or already canceled.",
      "BOOKING_NOT_FOUND",
      404
    );
  }

  const { data: slot } = await supabase
    .from("lesson_slots")
    .select("start_time,end_time,time_zone,price,location")
    .eq("id", booking.slot_id)
    .maybeSingle();

  if (!slot) {
    throw new PrivateLessonBookingError("Lesson slot not found.", "SLOT_NOT_FOUND", 404);
  }

  const { data: instructor } = await supabase
    .from("profiles")
    .select("first_name,last_name")
    .eq("id", booking.instructor_id)
    .maybeSingle();

  const instructorName = instructor
    ? `${instructor.first_name || ""} ${instructor.last_name || ""}`.trim() || "Instructor"
    : "Instructor";

  return {
    instructorName,
    lessonStart: slot.start_time,
    lessonEnd: slot.end_time,
    timeZone: slot.time_zone ?? null,
    price: slot.price ?? null,
    location: slot.location ?? null,
  };
}
