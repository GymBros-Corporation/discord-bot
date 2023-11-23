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
  let count = 0

  // Check each user for accepted friends
  for (const user of newUsers) {
    const { data: friends, error: friendsError } = await supabase
      .from("Friends")
      .select("*")
      .or(`userId.eq.${user.id},friendId.eq.${user.id}`)
      .eq("status", "ACCEPTED")

    if (friendsError) {
      console.error("Error fetching friends data: ", friendsError)
      continue // Or handle the error as needed
    }

    if (friends.length === 0) {
      count++
    }
  }

  return count
}

export async function getWeeklyReport(): Promise<string> {
  // Core
  const currentDate = new Date().toDateString()
  const totalUsers = await getTotalUsersCount(new Date().toISOString())
  const weekGrowth = await calculateTotalUserGrowth(7)
  const activeUsersToday = await getActiveUsersCount(getDateDaysAgo(1), new Date().toISOString())
  const activeUsersWeek = await getActiveUsersCount(getDateDaysAgo(7), new Date().toISOString())
  const dayGrowth = await calculateUserGrowth(2, 1)
  const weekActiveGrowth = await calculateUserGrowth(14, 7)

  // Premium
  const totalPremiumUsers = 0
  // const totalPremiumUsers = await getTotalPremiumUsers()
  const premiumPenetration = (totalPremiumUsers / activeUsersWeek) * 100

  // New
  const newUsers = await getNewUsers(7)
  const newUsersWithoutFriends = await getNewUsersWithoutFriends(newUsers)
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

  return responseContent
}
