import React, { useState, useCallback } from "react";
import debounce from "lodash.debounce";
import { searchUsers, sendFriendRequest as sendFriendRequestApi } from "../lib/api";
import { SearchIcon, UserPlus, BellRing } from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";

// A simple placeholder for user avatars
const UserAvatar = ({ profilePic }) => (
  <div className='avatar placeholder'>
    <div className='bg-neutral text-neutral-content rounded-full w-12'>
      {profilePic ? <img src={profilePic} alt='profile' /> : <span className='text-xl'>?</span>}
    </div>
  </div>
);

const SearchFriends = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sendingRequestId, setSendingRequestId] = useState(null);
  const navigate = useNavigate();

  // --- API Call to Send a Friend Request ---
  const handleSendFriendRequest = async (recipientId) => {
    setSendingRequestId(recipientId);
    try {
      await sendFriendRequestApi(recipientId);
      // Update the UI to show "Request Sent" for that user
      setResults((prevResults) =>
        prevResults.map((user) =>
          user._id === recipientId
            ? { ...user, friendshipStatus: "request_sent" }
            : user
        )
      );
      toast.success("Friend request sent!");
    } catch (error) {
      console.error("Error sending friend request", error);
      toast.error(error.response?.data?.message || "Failed to send request.");
    } finally {
      setSendingRequestId(null);
    }
  };

  // --- API Call to Fetch Search Results ---
  const fetchUsers = async (searchQuery) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setMessage("");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const data = await searchUsers(searchQuery);
      setResults(data);
      if (data.length === 0) {
        setMessage("No users found.");
      }
    } catch (err) {
      console.error(err);
      setMessage("Error fetching users.");
    } finally {
      setLoading(false);
    }
  };

  // Debounced version of the fetch function
  const debouncedFetchUsers = useCallback(debounce(fetchUsers, 400), []);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    debouncedFetchUsers(value);
  };

  // --- Renders the correct button based on friendshipStatus ---
  const renderFriendshipButton = (user) => {
    const isSending = sendingRequestId === user._id;

    switch (user.friendshipStatus) {
      case "request_sent":
        return <button className='btn btn-sm' disabled>Request Sent</button>;
      case "request_received":
        return (
          <button className='btn btn-sm btn-secondary' onClick={() => navigate("/notifications")}>
            <BellRing className='size-4 mr-1' />
            Accept Request
          </button>
        );
      case "not_friends":
      default:
        return (
          <button
            onClick={() => handleSendFriendRequest(user._id)}
            className='btn btn-sm btn-primary'
            disabled={isSending}
          >
            {isSending ? (
              <span className='loading loading-spinner loading-xs' />
            ) : (
              <>
                <UserPlus className='size-4 mr-1' />
                Add Friend
              </>
            )}
          </button>
        );
    }
  };

  return (
    <div className='max-w-xl mx-auto'>
      <h2 className='text-2xl font-bold mb-4'>Find People</h2>
      <div className='form-control relative'>
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <SearchIcon className="size-5 text-base-content opacity-40" />
        </div>
        <input
          type='text'
          placeholder='Search by name or technology...'
          value={query}
          onChange={handleInputChange}
          className='input input-bordered w-full pl-10'
        />
      </div>
      {loading && <p className='text-center mt-4'>Searching...</p>}

      <div className='search-results mt-6 space-y-3'>
        {!loading &&
          results.length > 0 &&
          results.map((user) => (
            <div
              key={user._id}
              className='flex items-center justify-between p-3 bg-base-200 rounded-lg shadow'
            >
              <div className='flex items-center gap-4'>
                <UserAvatar profilePic={user.profilePic} />
                <div>
                  <p className='font-bold text-lg'>{user.fullName}</p>
                  {user.technologiesInterestedIn?.length > 0 && (
                    <p className='text-sm text-gray-500'>
                      Interests: {user.technologiesInterestedIn.join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <div className='flex-shrink-0'>{renderFriendshipButton(user)}</div>
            </div>
          ))}
        {!loading && message && <p className='text-center mt-4'>{message}</p>}
      </div>
    </div>
  );
};

export default SearchFriends;