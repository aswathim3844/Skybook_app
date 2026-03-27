"use client";

import CrudPage from "@/components/admin/CrudPage";
import { createHotel, deleteHotel, fetchAdminHotels, updateHotel } from "@/lib/api";

const emptyHotel = {
  hotel_name: "",
  city: "",
  country: "",
  price_per_night: "",
  rating: "",
  description: "",
  image_url: "",
  amenities: "",
  available_rooms: "",
};

export default function HotelsPage() {
  return (
    <CrudPage
      title="Hotel listings"
      description="Basic CRUD controls for hotel inventory with permission-aware write access."
      columns={["Hotel", "City", "Country", "Rooms", "Rating", "Nightly rate"]}
      loadData={fetchAdminHotels}
      createItem={createHotel}
      updateItem={updateHotel}
      deleteItem={deleteHotel}
      createPermission="hotels.write"
      editPermission="hotels.write"
      deletePermission="hotels.delete"
      initialForm={(item) => ({
        ...emptyHotel,
        ...(item
          ? {
              hotel_name: item.hotel_name || "",
              city: item.city || "",
              country: item.country || "",
              price_per_night: item.price_per_night || "",
              rating: item.rating || "",
              description: item.description || "",
              image_url: item.image_url || "",
              amenities: item.amenities || "",
              available_rooms: item.available_rooms || "",
            }
          : {}),
      })}
      renderForm={({ form, setForm }) => (
        <>
          <Input label="Hotel name" value={form.hotel_name} onChange={(value) => setForm((state) => ({ ...state, hotel_name: value }))} />
          <Input label="City" value={form.city} onChange={(value) => setForm((state) => ({ ...state, city: value }))} />
          <Input label="Country id" value={form.country} onChange={(value) => setForm((state) => ({ ...state, country: value }))} />
          <Input label="Price per night" value={form.price_per_night} onChange={(value) => setForm((state) => ({ ...state, price_per_night: value }))} />
          <Input label="Rating" value={form.rating} onChange={(value) => setForm((state) => ({ ...state, rating: value }))} />
          <Input label="Image URL" value={form.image_url} onChange={(value) => setForm((state) => ({ ...state, image_url: value }))} />
          <Input label="Available rooms" value={form.available_rooms} onChange={(value) => setForm((state) => ({ ...state, available_rooms: value }))} />
          <TextArea label="Amenities" value={form.amenities} onChange={(value) => setForm((state) => ({ ...state, amenities: value }))} />
          <TextArea label="Description" value={form.description} onChange={(value) => setForm((state) => ({ ...state, description: value }))} />
        </>
      )}
      rowKey={(item) => item.hotel_id}
      rowMapper={(item) => [
        item.hotel_name || `Hotel ${item.hotel_id}`,
        item.city || "--",
        item.country_name || "--",
        item.available_rooms ?? "--",
        item.rating ?? "--",
        item.price_per_night || "0.00",
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

function TextArea({ label, value, onChange }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-slate-300">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="rounded-[16px] border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
      />
    </label>
  );
}
