import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cancelPrivateLessonBooking,
  createPrivateLessonBooking,
  PrivateLessonBookingError,
} from "@/lib/privateLessonBooking";

const futureStart = new Date(Date.now() + 86400000).toISOString();
const pastStart = new Date(Date.now() - 86400000).toISOString();

function makeSupabase(handlers: {
  slot?: Record<string, unknown> | null;
  slotAfterBook?: { is_booked: boolean };
  insertBooking?: { id: string } | null;
  insertError?: { message: string } | null;
  bookingByToken?: Record<string, unknown> | null;
  bookingById?: Record<string, unknown> | null;
}) {
  const deleteBooking = vi.fn(async () => ({ error: null }));
  const updateSlot = vi.fn(async () => ({ error: null }));

  let slotSelectCount = 0;

  const from = vi.fn((table: string) => {
    if (table === "lesson_slots") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              slotSelectCount += 1;
              if (slotSelectCount > 1 && handlers.slotAfterBook) {
                return { data: handlers.slotAfterBook, error: null };
              }
              return { data: handlers.slot ?? null, error: null };
            },
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: async () => updateSlot(),
          }),
        }),
      };
    }

    if (table === "lesson_bookings") {
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: handlers.insertBooking ?? { id: "booking-1" },
              error: handlers.insertError ?? null,
            }),
          }),
        }),
        select: () => ({
          eq: (_col: string, val: string) => ({
            maybeSingle: async () => {
              if (_col === "cancel_token") {
                return { data: handlers.bookingByToken ?? null, error: null };
              }
              if (_col === "id" && val === "booking-owned") {
                return { data: handlers.bookingById ?? null, error: null };
              }
              return { data: handlers.bookingById ?? null, error: null };
            },
          }),
        }),
        delete: () => ({
          eq: async () => deleteBooking(),
        }),
      };
    }

    return {};
  });

  return { from, deleteBooking, updateSlot };
}

describe("createPrivateLessonBooking", () => {
  it("creates booking when slot is available", async () => {
    const { from } = makeSupabase({
      slot: {
        id: "slot-1",
        instructor_id: "inst-1",
        start_time: futureStart,
        end_time: futureStart,
        is_booked: false,
        duration_minutes: 60,
        price: 50,
        time_zone: "America/Chicago",
        location: "Studio",
      },
      slotAfterBook: { is_booked: true },
      insertBooking: { id: "booking-1" },
    });

    const result = await createPrivateLessonBooking({ from } as any, {
      slotId: "slot-1",
      instructorId: "inst-1",
      firstName: "Alex",
      lastName: "Smith",
      email: "alex@example.com",
      phoneNumber: "555-0100",
      lessonFocus: "Lead Focused",
    });

    expect(result.bookingId).toBe("booking-1");
    expect(result.cancelToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(result.studentName).toBe("Alex Smith");
  });

  it("rejects past slots", async () => {
    const { from } = makeSupabase({
      slot: {
        id: "slot-1",
        instructor_id: "inst-1",
        start_time: pastStart,
        end_time: pastStart,
        is_booked: false,
      },
    });

    await expect(
      createPrivateLessonBooking({ from } as any, {
        slotId: "slot-1",
        instructorId: "inst-1",
        firstName: "A",
        lastName: "B",
        email: "a@b.com",
        phoneNumber: "1",
        lessonFocus: "Follow Focused",
      })
    ).rejects.toMatchObject({ code: "SLOT_IN_PAST" });
  });

  it("rejects already booked slots", async () => {
    const { from } = makeSupabase({
      slot: {
        id: "slot-1",
        instructor_id: "inst-1",
        start_time: futureStart,
        end_time: futureStart,
        is_booked: true,
      },
    });

    await expect(
      createPrivateLessonBooking({ from } as any, {
        slotId: "slot-1",
        instructorId: "inst-1",
        firstName: "A",
        lastName: "B",
        email: "a@b.com",
        phoneNumber: "1",
        lessonFocus: "Follow Focused",
      })
    ).rejects.toMatchObject({ code: "SLOT_ALREADY_BOOKED" });
  });
});

describe("cancelPrivateLessonBooking", () => {
  const bookingRow = {
    id: "booking-owned",
    slot_id: "slot-1",
    instructor_id: "inst-1",
    user_id: "user-1",
    student_name: "Alex Smith",
    student_email: "alex@example.com",
    first_name: "Alex",
    last_name: "Smith",
    email: "alex@example.com",
  };

  const slotRow = {
    id: "slot-1",
    instructor_id: "inst-1",
    start_time: futureStart,
    end_time: futureStart,
    is_booked: true,
    time_zone: "America/Chicago",
  };

  it("cancels by token", async () => {
    const supabase = makeSupabase({
      bookingByToken: bookingRow,
      slot: slotRow,
    });

    const result = await cancelPrivateLessonBooking(supabase as any, {
      cancelToken: "token-abc",
    });

    expect(result.instructorId).toBe("inst-1");
    expect(result.studentName).toBe("Alex Smith");
  });

  it("forbids cancel by booking id for wrong user", async () => {
    const supabase = makeSupabase({
      bookingById: { ...bookingRow, user_id: "other-user" },
      slot: slotRow,
    });

    await expect(
      cancelPrivateLessonBooking(supabase as any, {
        bookingId: "booking-owned",
        userId: "user-1",
      })
    ).rejects.toBeInstanceOf(PrivateLessonBookingError);
  });
});
