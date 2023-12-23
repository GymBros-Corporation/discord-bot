import axios from "axios"
import { supabase } from "../../supabaseClient"

function getDateDaysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

async function getTotalUsersCount(upToDate: string): Promise<number> {
  const { error, count } = await supabase.from("User").select("*", { count: "exact" }).lte("accountCreation", upToDate)

  if (error || count === null) {
    console.error("Error fetching data: ", error)
    return 0
  }

  return count
}

async function getTotalPremiumUsers(): Promise<number> {
  const { error, count } = await supabase.from("User").select("*", { count: "exact" }).eq("isPremium", true)

  if (error || count === null) {
    console.error("Error fetching data: ", error)
    return 0
  }

  return count
}

async function getActiveUsersCount(fromDate: string, toDate: string): Promise<number> {
  const { data, error } = await supabase
    .from("Post")
    .select("authorId")
    .gte("postedAt", fromDate)
    .lt("postedAt", toDate)
    .order("authorId", { ascending: true })

  if (error || data === null) {
    console.error("Error fetching data: ", error)
    return 0
  }

  const uniqueAuthorIds = new Set()

  data.forEach((entry: { authorId: string }) => {
    uniqueAuthorIds.add(entry.authorId)
  })

  return uniqueAuthorIds.size
}

async function calculateUserGrowth(numDaysAgo: number, duration: number): Promise<number> {
  const currentCount = await getActiveUsersCount(getDateDaysAgo(duration), new Date().toISOString())
  const pastCount = await getActiveUsersCount(getDateDaysAgo(numDaysAgo), getDateDaysAgo(duration))

  let growth = 0
  if (pastCount > 0) {
    growth = ((currentCount - pastCount) / pastCount) * 100
  }

  return growth
}

async function calculateTotalUserGrowth(numDaysAgo: number) {
  // Total users up to the end of the current week
  const currentWeekTotal = await getTotalUsersCount(new Date().toISOString())

  // Total users up to the end of the previous week
  const previousWeekTotal = await getTotalUsersCount(getDateDaysAgo(numDaysAgo))

  if (!currentWeekTotal || !previousWeekTotal) {
    throw new Error()
  }

  // Calculate growth
  let growth = 0
  if (previousWeekTotal > 0) {
    growth = ((currentWeekTotal - previousWeekTotal) / previousWeekTotal) * 100
  }

  return growth
}

async function getNewUsers(numDaysAgo: number): Promise<{ id: string }[]> {
  const fromDate = getDateDaysAgo(numDaysAgo)
  const { data, error, count } = await supabase
    .from("User")
    .select("id", { count: "exact" })
    .gte("accountCreation", fromDate)

  if (error || count === null) {
    console.error("Error fetching new users: ", error)
    return []
  }

  return data
}

async function getNewUsersWithoutFriends(newUsers: { id: string }[]) {
  const promises = newUsers.map((user) => {
    return supabase
      .from("Friends")
      .select("*")
      .or(`userId.eq.${user.id},friendId.eq.${user.id}`)
      .eq("status", "ACCEPTED")
      .then(({ data: friends }) => (friends?.length === 0 ? 1 : 0))
  })

  const results = await Promise.all(promises)
  return results.reduce((count: number, hasNoFriends: 0 | 1) => count + hasNoFriends, 0)
}

export async function getWeeklyReport(): Promise<string> {
  // Core
  const currentDate = new Date().toDateString()
  console.time("1")
  const totalUsers = await getTotalUsersCount(new Date().toISOString())
  console.timeEnd("1")
  console.time("2")
  const weekGrowth = await calculateTotalUserGrowth(7)
  console.timeEnd("2")
  console.time("3")
  const activeUsersToday = await getActiveUsersCount(getDateDaysAgo(1), new Date().toISOString())
  console.timeEnd("3")
  console.time("4")
  const activeUsersWeek = await getActiveUsersCount(getDateDaysAgo(7), new Date().toISOString())
  console.timeEnd("4")
  console.time("5")
  const dayGrowth = await calculateUserGrowth(2, 1)
  console.timeEnd("5")
  console.time("6")
  const weekActiveGrowth = await calculateUserGrowth(14, 7)
  console.timeEnd("6")
  console.time("7")

  // Premium
  const totalPremiumUsers = 0
  // const totalPremiumUsers = await getTotalPremiumUsers()
  const premiumPenetration = (totalPremiumUsers / activeUsersWeek) * 100

  // New
  const newUsers = await getNewUsers(7)
  console.timeEnd("7")
  console.time("8")
  const newUsersWithoutFriends = await getNewUsersWithoutFriends(newUsers)
  console.timeEnd("8")
  console.time("9")
  const newUsersWithoutFriendsPercentage = (newUsersWithoutFriends / newUsers.length) * 100

  let responseContent = ""
  const separator = " | "
  const header = `Metric                                                ${separator}Value\n`
  const line = "-------------------------------------------\n"

  responseContent += `**Metrics as of ${currentDate}**\n`
  responseContent += line
  responseContent += header
  responseContent += line
  responseContent += "**User Metrics**\n"
  responseContent += `Total Registered Users                 ${separator}${totalUsers.toLocaleString()} (Week-over-Week Growth: ${weekGrowth.toFixed(
    2
  )}%)\n`
  responseContent += `Daily Active Users                         ${separator}${activeUsersToday.toLocaleString()} (Day-over-Day Growth: ${dayGrowth.toFixed(
    2
  )}%)\n`
  responseContent += `Weekly Active Users                     ${separator}${activeUsersWeek.toLocaleString()} (Week-over-Week Growth: ${weekActiveGrowth.toFixed(
    2
  )}%)\n`
  responseContent += line
  responseContent += "**Revenue Metrics**\n"
  responseContent += `Total Premium Users                    ${separator}${totalPremiumUsers.toLocaleString()}\n`
  responseContent += `Premium User Penetration         ${separator}${premiumPenetration.toFixed(2)}%\n`
  responseContent += line
  responseContent += "**New User Metrics (past week)**\n"
  responseContent += `New Users                                        ${separator}${newUsers.length.toLocaleString()}\n`
  responseContent += `New Users without Friends        ${separator}${newUsersWithoutFriends.toLocaleString()} (${newUsersWithoutFriendsPercentage.toFixed(
    2
  )}% of New Users)\n`
  responseContent += line
  console.timeEnd("9")

  return responseContent
}

export async function sendWeeklyReport() {
  // CHANGE TO PROD later
  axios.post("https://app-website-git-dev-gymbrocorp.vercel.app/api/trpc/analytics.sendMetricsToDiscord")
}
