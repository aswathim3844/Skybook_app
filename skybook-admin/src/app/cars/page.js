"use client";

import CrudPage from "@/components/admin/CrudPage";
import { createCar, deleteCar, fetchAdminCars, updateCar } from "@/lib/api";

const emptyCar = {
  company: "",
  car_model: "",
  car_type: "",
  city: "",
  country: "",
  price_per_day: "",
  car_seats: "",
  image_url: "",
  availability: "true",
  description: "",
};

export default function CarsPage() {
  return (
    <CrudPage
      title="Car inventory"
      description="Manage rental inventory with role-gated create, update, and delete actions."
      columns={["Company", "Model", "City", "Type", "Seats", "Rate/day"]}
      loadData={fetchAdminCars}
      createItem={createCar}
      updateItem={updateCar}
      deleteItem={deleteCar}
      createPermission="cars.write"
      editPermission="cars.write"
      deletePermission="cars.delete"
      initialForm={(item) => ({
        ...emptyCar,
        ...(item
          ? {
              company: item.company || "",
              car_model: item.car_model || "",
              car_type: item.car_type || "",
              city: item.city || "",
              country: item.country || "",
              price_per_day: item.price_per_day || "",
              car_seats: item.car_seats || "",
              image_url: item.image_url || "",
              availability: String(item.availability ?? true),
              description: item.description || "",
            }
          : {}),
      })}
      renderForm={({ form, setForm }) => (
        <>
          <Input label="Company" value={form.company} onChange={(value) => setForm((state) => ({ ...state, company: value }))} />
          <Input label="Model" value={form.car_model} onChange={(value) => setForm((state) => ({ ...state, car_model: value }))} />
          <Input label="Type" value={form.car_type} onChange={(value) => setForm((state) => ({ ...state, car_type: value }))} />
          <Input label="City" value={form.city} onChange={(value) => setForm((state) => ({ ...state, city: value }))} />
          <Input label="Country id" value={form.country} onChange={(value) => setForm((state) => ({ ...state, country: value }))} />
          <Input label="Price per day" value={form.price_per_day} onChange={(value) => setForm((state) => ({ ...state, price_per_day: value }))} />
          <Input label="Seats" value={form.car_seats} onChange={(value) => setForm((state) => ({ ...state, car_seats: value }))} />
          <Input label="Image URL" value={form.image_url} onChange={(value) => setForm((state) => ({ ...state, image_url: value }))} />
          <label className="grid gap-2">
            <span className="text-sm text-slate-300">Availability</span>
            <select
              value={form.availability}
              onChange={(event) => setForm((state) => ({ ...state, availability: event.target.value }))}
              className="min-h-11 rounded-[16px] border border-white/10 bg-black/20 px-4 text-white outline-none"
            >
              <option value="true">Available</option>
              <option value="false">Unavailable</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm text-slate-300">Description</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((state) => ({ ...state, description: event.target.value }))}
              rows={3}
              className="rounded-[16px] border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            />
          </label>
        </>
      )}
      rowKey={(item) => item.car_id}
      rowMapper={(item) => [
        item.company || "--",
        item.car_model || "--",
        item.city || "--",
        item.car_type || "--",
        item.car_seats ?? "--",
        item.price_per_day || "0.00",
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
