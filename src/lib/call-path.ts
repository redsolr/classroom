/**
 * Where a lesson's call room lives.
 *
 * One function because the route was spelled in ten places — three
 * surfaces that link to it, four revalidations, and the agent door that
 * hands the path back to whoever asked. A URL the product owns is a
 * property of the LESSON, not of each verb applied to one, and the day
 * this route moves is the day nine of those ten get found and the tenth
 * does not.
 *
 * Deliberately not `server-only`: the links live in client components
 * and the actions live on the server, and both need the same answer.
 */
export function callPath(lessonId: string): string {
  return `/call/${lessonId}`;
}
