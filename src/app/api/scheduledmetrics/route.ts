import { getWeeklyReport } from "@/app/utils/weeklyreport"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const weeklyReport = await getWeeklyReport()
  return new NextResponse(weeklyReport, { status: 200 })
}
