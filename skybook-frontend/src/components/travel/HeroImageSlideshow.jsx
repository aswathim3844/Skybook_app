"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const heroImages = [
  "/images/image_2.jpg",
  "/images/image_3.jpg",
  "/images/image_4.jpg",
  "/images/OIP.jpg",
  "/images/OIP (1).jpg",
  "/images/OIP (1).webp",
];

export default function HeroImageSlideshow() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % heroImages.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="rounded-[36px] border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
      <div className="relative h-[420px] overflow-hidden rounded-[28px]">
        {heroImages.map((src, index) => (
          <div
            key={src}
            className={`absolute inset-0 transition-opacity duration-700 ${
              index === activeIndex ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image
              src={src}
              alt={`Travel inspiration ${index + 1}`}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 720px"
              priority={index === 0}
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#09214d]/40 via-transparent to-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
