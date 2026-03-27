"use client";

import CrudPage from "@/components/admin/CrudPage";
import { createFlight, deleteFlight, fetchAdminFlights, updateFlight } from "@/lib/api";

const emptyFlight = {
  flight_number: "",
  airline: "",
  departure_airport: "",
  arrival_airport: "",
  departure_time: "",
  arrival_time: "",
  base_price: "",
  available_seats: "",
  duration_minutes: "",
  flight_class: "",
  status: "",
};

export default function FlightsPage() {
  return (
    <CrudPage
      title="Flight inventory"
      description="Create, update, and remove flight records with inventory-level access control."
      columns={["Flight", "Airline", "Route", "Departure", "Seats", "Price"]}
      loadData={fetchAdminFlights}
      createItem={createFlight}
      updateItem={updateFlight}
      deleteItem={deleteFlight}
      createPermission="flights.write"
      editPermission="flights.write"
      deletePermission="flights.delete"
      initialForm={(item) => ({
        ...emptyFlight,
        ...(item
          ? {
              flight_number: item.flight_number || "",
              airline: item.airline || "",
              departure_airport: item.departure_airport || "",
              arrival_airport: item.arrival_airport || "",
              departure_time: item.departure_time || "",
              arrival_time: item.arrival_time || "",
              base_price: item.base_price || item.price || "",
              available_seats: item.available_seats || "",
              duration_minutes: item.duration_minutes || "",
              flight_class: item.flight_class || "",
              status: item.status || "",
            }
          : {}),
      })}
      renderForm={({ form, setForm }) => (
        <>
          <Input label="Flight number" value={form.flight_number} onChange={(value) => setForm((state) => ({ ...state, flight_number: value }))} />
          <Input label="Airline" value={form.airline} onChange={(value) => setForm((state) => ({ ...state, airline: value }))} />
          <Input label="Departure airport id" value={form.departure_airport} onChange={(value) => setForm((state) => ({ ...state, departure_airport: value }))} />
          <Input label="Arrival airport id" value={form.arrival_airport} onChange={(value) => setForm((state) => ({ ...state, arrival_airport: value }))} />
          <Input label="Departure time (ISO)" value={form.departure_time} onChange={(value) => setForm((state) => ({ ...state, departure_time: value }))} />
          <Input label="Arrival time (ISO)" value={form.arrival_time} onChange={(value) => setForm((state) => ({ ...state, arrival_time: value }))} />
          <Input label="Base price" value={form.base_price} onChange={(value) => setForm((state) => ({ ...state, base_price: value }))} />
          <Input label="Available seats" value={form.available_seats} onChange={(value) => setForm((state) => ({ ...state, available_seats: value }))} />
          <Input label="Duration minutes" value={form.duration_minutes} onChange={(value) => setForm((state) => ({ ...state, duration_minutes: value }))} />
          <Input label="Flight class" value={form.flight_class} onChange={(value) => setForm((state) => ({ ...state, flight_class: value }))} />
          <Input label="Status" value={form.status} onChange={(value) => setForm((state) => ({ ...state, status: value }))} />
        </>
      )}
      rowKey={(item) => item.flight_id}
      rowMapper={(item) => [
        item.flight_number || `FL-${item.flight_id}`,
        item.airline || "--",
        `${item.departure_city || "--"} to ${item.arrival_city || "--"}`,
        item.departure_time || "--",
        item.available_seats ?? "--",
        item.price || item.base_price || "0.00",
      ]}
    />
  );
}

function Input({ label, value, onChange }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-slate-300">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-[16px] border border-white/10 bg-black/20 px-4 text-white outline-none"
      />
    </label>
  );
}
