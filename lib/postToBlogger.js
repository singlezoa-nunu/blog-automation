const { OAuth2Client } = require("google-auth-library");

async function postToBlogger({ clientId, clientSecret, refreshToken, blogId, title, html, labels }) {
  const oAuth2Client = new OAuth2Client(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  const { token } = await oAuth2Client.getAccessToken();
  if (!token) throw new Error("액세스 토큰 발급 실패. refresh token이 만료/취소되었을 수 있습니다.");

  const response = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title,
      content: html,
      labels,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Blogger API 오류 (${response.status}): ${JSON.stringify(data)}`);
  }

  return data; // data.url 에 발행된 글 주소가 들어있음
}

module.exports = { postToBlogger };
