"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, PencilLine, SendHorizontal } from "lucide-react";
import { aiRecommendations, itinerary, plannerMessages } from "@/lib/mock-data";
import { AIRecommendationCard } from "@/components/travel/TravelUI";

const starterPrompt = "Plan a trip to Paris for 5 days under $500";

export default function AIPlannerExperience() {
  const [prompt, setPrompt] = useState(starterPrompt);
  const [messages, setMessages] = useState(plannerMessages);

  const recommendationTitle = useMemo(() => {
    const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
    return latestUserMessage?.content || starterPrompt;
  }, [messages]);

  function handleSend() {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        role: "user",
        content: trimmedPrompt,
      },
      {
        role: "assistant",
        content:
          "This is the chat input stage. Later we can connect this send button to a real chatbot API and return a dynamic trip plan.",
      },
    ]);
    setPrompt("");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
          Conversation
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">AI travel planner chat</h2>

        <div className="mt-6 space-y-4">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[92%] rounded-[24px] px-4 py-4 text-sm leading-7 ${
                message.role === "user"
                  ? "ml-auto rounded-tr-[14px] bg-orange-500 text-white"
                  : "rounded-tl-[14px] bg-slate-100 text-slate-700"
              }`}
            >
              {message.content}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
          <label className="block">
            <span className="sr-only">Ask the travel planner</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Plan a trip to Paris for 5 days under $500"
              className="min-h-[150px] w-full resize-none bg-transparent text-base leading-7 text-slate-800 outline-none"
            />
          </label>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Type your travel request naturally, then send it to the planner.
            </p>
            <button
              onClick={handleSend}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              <SendHorizontal className="h-4 w-4" />
              Send
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
                Current request
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-slate-900">
                Suggested plan cards
              </h3>
            </div>
            <Bot className="h-6 w-6 text-slate-400" />
          </div>

          <div className="mt-5 rounded-[24px] bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            {recommendationTitle}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {aiRecommendations.map((item, index) => (
              <AIRecommendationCard key={item.id} item={item} selected={index < 3} />
            ))}
          </div>
        </div>

        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">
                Itinerary
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-slate-900">Trip outline</h3>
            </div>
            <Bot className="h-6 w-6 text-slate-400" />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {itinerary.map((day) => (
              <div key={day.day} className="rounded-[24px] border border-slate-200 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{day.day}</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{day.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{day.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300">
              <PencilLine className="h-4 w-4" />
              Modify Plan
            </button>
            <Link
              href="/trip-confirmed"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              Confirm Trip
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
